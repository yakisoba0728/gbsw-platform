import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import * as board from "./board.service";
import { canWrite } from "./community.access";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import {
  POSTS_PER_PAGE,
  type CreatePostInput,
  type DeletePostInput,
  type UpdatePostInput,
} from "./community.schema";
import { deleteAttachment } from "./community.storage";
import {
  toPostListItem,
  toPostView,
  type PostListItemView,
  type PostView,
} from "./community.view";

async function loadPost(
  actor: SessionUser,
  postId: string,
  gate: "read" | "write" = "read",
) {
  const post = await repo.findPost(postId);
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  const community =
    gate === "write"
      ? await board.getWritableBySlug(actor, post.community.slug)
      : await board.getReadableBySlug(actor, post.community.slug);
  return { post, community };
}

type PostDetail = {
  post: PostView;
  community: {
    slug: string;
    name: string;
    anonymous: boolean;
    allowAttachments: boolean;
  };
  attachments: Awaited<ReturnType<typeof repo.listAttachments>>;
  canWrite: boolean;
};

export async function getPost(
  actor: SessionUser,
  postId: string,
): Promise<PostDetail> {
  const { post, community } = await loadPost(actor, postId);
  return {
    post: toPostView(post, community, actor),
    community: {
      slug: community.slug,
      name: community.name,
      anonymous: community.anonymous,
      allowAttachments: community.allowAttachments,
    },
    attachments: await repo.listAttachments(postId),
    canWrite: canWrite(actor, community),
  };
}

type PostPage = {
  community: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    anonymous: boolean;
    allowAttachments: boolean;
  };
  posts: PostListItemView[];
  page: number;
  pageCount: number;
  canWrite: boolean;
};

export async function listPostPage(
  actor: SessionUser,
  slug: string,
  page: number,
): Promise<PostPage> {
  const community = await board.getReadableBySlug(actor, slug);

  const [total, rows] = await Promise.all([
    repo.countPosts(community.id),
    repo.listPosts(community.id, (page - 1) * POSTS_PER_PAGE, POSTS_PER_PAGE),
  ]);

  return {
    community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      anonymous: community.anonymous,
      allowAttachments: community.allowAttachments,
    },
    posts: rows.map((row) => toPostListItem(row, community, actor, row._count.comments)),
    page,
    pageCount: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)),
    canWrite: canWrite(actor, community),
  };
}

export type RecentPostView = PostListItemView & {
  communitySlug: string;
  communityName: string;
};

export async function listRecentPosts(
  actor: SessionUser,
  take: number,
): Promise<RecentPostView[]> {
  const communities = await board.listReadable(actor);
  if (communities.length === 0) return [];

  const byId = new Map(communities.map((c) => [c.id, c]));
  const rows = await repo.listRecentPostsAcross([...byId.keys()], take);

  return rows.map((row) => {
    const community = byId.get(row.communityId)!;
    return {
      ...toPostListItem(row, community, actor, row._count.comments),
      communitySlug: community.slug,
      communityName: community.name,
    };
  });
}

export async function createPost(
  actor: SessionUser,
  input: CreatePostInput,
): Promise<{ postId: string; slug: string }> {
  const community = await board.getWritableBySlug(actor, input.slug);

  if (input.attachmentIds.length > 0 && !community.allowAttachments) {
    throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
  }

  return withTransaction(async (tx) => {
    const { id } = await repo.createPost(
      {
        communityId: community.id,
        title: input.title,
        body: input.body,
        authorUserId: actor.id,
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    const requested = [...new Set(input.attachmentIds)];
    const attached = await repo.attachToPost(requested, id, actor.id, tx);
    if (attached !== requested.length) {
      throw new CommunityError("ATTACHMENT_NOT_FOUND");
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:create",
        targetType: "CommunityPost",
        targetId: id,
        metadata: {
          communityId: community.id,
          slug: community.slug,
          title: input.title,
          attachments: attached,
        },
      },
      tx,
    );

    return { postId: id, slug: community.slug };
  });
}

export async function updatePost(
  actor: SessionUser,
  input: UpdatePostInput,
): Promise<{ slug: string }> {
  const { post, community } = await loadPost(actor, input.postId, "write");

  if (post.authorUserId === null || post.authorUserId !== actor.id) {
    await denyAccess(actor, "community:post:update", {
      targetType: "CommunityPost",
      targetId: input.postId,
      actorName: actor.name,
    });
  }

  if (input.attachmentIds.length > 0 && !community.allowAttachments) {
    throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
  }

  let detached: repo.DetachedFile[] = [];

  await withTransaction(async (tx) => {
    const ok = await repo.updatePost(
      input.postId,
      { title: input.title, body: input.body },
      input.updatedAt,
      tx,
    );
    if (!ok) throw new CommunityError("POST_CONFLICT");

    const requested = [...new Set(input.attachmentIds)];
    const attached = await repo.attachToPost(requested, input.postId, actor.id, tx);
    if (attached !== requested.length) {
      throw new CommunityError("ATTACHMENT_NOT_FOUND");
    }

    // 첨부를 금지한 게시판에서는 폼에 없는 기존 첨부를 보존한다.
    detached = community.allowAttachments
      ? await repo.detachFromPost(input.postId, requested, tx)
      : [];

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:update",
        targetType: "CommunityPost",
        targetId: input.postId,
        metadata: {
          slug: community.slug,
          titleFrom: post.title,
          titleTo: input.title,
          ...(community.allowAttachments ? { attachments: attached } : {}),
          attachmentsRemoved: detached.length,
        },
      },
      tx,
    );

    for (const file of detached) {
      await recordAudit(
        {
          actorUserId: actor.id,
          actorName: actor.name,
          action: "community:attachment:delete",
          targetType: "CommunityAttachment",
          targetId: file.id,
          metadata: {
            postId: input.postId,
            slug: community.slug,
            filename: file.filename,
          },
        },
        tx,
      );
    }
  });

  // 롤백 시 파일이 사라지지 않도록 커밋 후 삭제한다.
  for (const file of detached) {
    try {
      await deleteAttachment(file.storageKey, file.createdAt);
    } catch (error) {
      console.error("[community] 분리한 첨부 파일을 지우지 못했습니다.", error);
    }
  }

  return { slug: community.slug };
}

export async function deletePost(
  actor: SessionUser,
  input: DeletePostInput,
): Promise<{ slug: string }> {
  const { post, community } = await loadPost(actor, input.postId);

  const isMine = post.authorUserId !== null && post.authorUserId === actor.id;
  const isModerator = can(actor, "community:moderate");
  if (!isMine && !isModerator) {
    await denyAccess(actor, "community:post:delete", {
      targetType: "CommunityPost",
      targetId: input.postId,
      actorName: actor.name,
    });
  }

  if (!isMine && !input.reason) throw new CommunityError("REASON_REQUIRED");

  await withTransaction(async (tx) => {
    const removed = await repo.markPostDeleted(input.postId, tx);
    if (removed === 0) return;

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:post:delete",
        targetType: "CommunityPost",
        targetId: input.postId,
        metadata: {
          slug: community.slug,
          title: post.title,
          byModerator: !isMine && isModerator,
          reason: input.reason,
        },
      },
      tx,
    );
  });

  return { slug: community.slug };
}
