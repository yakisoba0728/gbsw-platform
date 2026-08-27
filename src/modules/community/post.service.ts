import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ForbiddenError } from "@/core/authz/errors";
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

/**
 * 글 서비스. **게시판 권한은 board.service의 문 둘을 거쳐서만 얻는다** —
 * 여기서 canRead/canWrite를 다시 부르지 않는다(버튼을 그릴지 정하는 자리만
 * 예외다). 검사가 두 곳에 있으면 한쪽만 고쳐지는 날이 온다.
 */

/** 소유권 거부. can()으로 못 가르는 거부라 직접 던지고 직접 기록한다. */
async function denyOwnership(
  actor: SessionUser,
  action: string,
  postId: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "CommunityPost",
      targetId: postId,
      metadata: { action },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/**
 * 글 한 건 + 그 게시판. **읽기 권한을 board.service에 다시 물어본다** —
 * 글에서 게시판으로 거슬러 왔다고 검사를 건너뛰면, 주소만 알면 남의 게시판
 * 글이 열린다.
 */
async function loadPost(actor: SessionUser, postId: string) {
  const post = await repo.findPost(postId);
  // 지워진 글은 "없는 글"이다 — 교사에게도. 있었다는 사실은 감사로그가 안다.
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  const community = await board.getReadableBySlug(actor, post.community.slug);
  return { post, community };
}

export type PostDetail = {
  post: PostView;
  community: {
    slug: string;
    name: string;
    anonymous: boolean;
    allowAttachments: boolean;
  };
  attachments: Awaited<ReturnType<typeof repo.listAttachments>>;
  /** 댓글 폼을 그릴지. 실제 통제는 comment.service가 한다. */
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

export type PostPage = {
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
  total: number;
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
    // 글이 없어도 한 쪽이다 — 페이지 0은 화면에서 표현할 수 없다.
    pageCount: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)),
    total,
    // 목록 화면의 「글쓰기」 버튼을 그릴지. 순수 함수를 직접 쓴다 — 버튼을
    // 그릴지 정하는 일이라 거부 기록이 필요 없다. 실제 통제는 createPost가
    // getWritableBySlug로 한다.
    canWrite: canWrite(actor, community),
  };
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
        // 계정이 지워져도 남을 스냅샷. 익명 게시판에서도 저장한다 —
        // 가리는 일은 화면 앞의 community.view.ts가 한다.
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    const attached = await repo.attachToPost(input.attachmentIds, id, actor.id, tx);
    // 하나도 안 붙었으면 남의 첨부이거나 이미 만료된 것이다. 글만 남기지 않는다.
    if (input.attachmentIds.length > 0 && attached === 0) {
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
          // 익명 게시판의 제목도 남긴다 — 빼도 시각으로 대조되므로 얻는 것이 없다.
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
  const { post, community } = await loadPost(actor, input.postId);

  // **본인만.** 교사도 남의 글은 못 고친다 — 조정은 삭제이지 대필이 아니다.
  if (post.authorUserId === null || post.authorUserId !== actor.id) {
    await denyOwnership(actor, "community:post:update", input.postId);
  }

  // 새로 쓸 때와 같은 문이다. 없으면 첨부를 안 받는 게시판의 글에 수정 경로로만
  // 파일이 붙는다 — 다른 게시판에 올린 첨부 id를 실어 보내면 된다.
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

    const attached = await repo.attachToPost(
      input.attachmentIds,
      input.postId,
      actor.id,
      tx,
    );
    // 뗀 파일은 트랜잭션 밖에서 지운다 — 롤백되면 행은 살아 있는데 파일만
    // 사라진다.
    detached = await repo.detachFromPost(input.postId, input.attachmentIds, tx);

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
          attachmentsAdded: attached,
          attachmentsRemoved: detached.length,
        },
      },
      tx,
    );

    // **뺀 첨부는 한 건씩 따로 남긴다.** 위의 개수만으로는 「누가 어떤 파일을
    // 지웠나」에 답할 수 없는데, 첨부 삭제는 이 모듈에서 되돌릴 수 없는 유일한
    // 삭제다 (글·댓글·게시판은 전부 표시만 지운다).
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

  // 커밋된 뒤에 디스크를 지운다.
  for (const file of detached) {
    await deleteAttachment(file.storageKey, file.createdAt);
  }

  return { slug: community.slug };
}

export async function deletePost(
  actor: SessionUser,
  input: DeletePostInput,
): Promise<{ slug: string }> {
  const { post, community } = await loadPost(actor, input.postId);

  const isMine = post.authorUserId !== null && post.authorUserId === actor.id;
  // 남의 글을 지우는 것은 조정이다 — 판정을 `can()`에 맡긴다. 역할 문자열을
  // 여기서 직접 비교하면 `RULES`를 고쳐도 이 줄이 안 따라온다.
  const isModerator = can(actor, "community:moderate");
  if (!isMine && !isModerator) {
    await denyOwnership(actor, "community:post:delete", input.postId);
  }

  // **남의 글을 지울 때는 사유가 필수다.** 화면의 모달도 받지만 그것만으로는
  // 폼을 건너뛴 요청을 못 막는다 — 나중에 「왜 지웠나」에 답할 자료가 사라진다.
  if (!isMine && !input.reason) throw new CommunityError("REASON_REQUIRED");

  await withTransaction(async (tx) => {
    const removed = await repo.markPostDeleted(input.postId, actor.id, input.reason, tx);
    // 이미 지운 글에 사유만 새로 남기지 않는다 — 삭제는 한 번만 일어난 일이다.
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
          // 본인 삭제와 교사의 조정을 감사로그에서 구분할 수 있어야 한다.
          byModerator: !isMine && isModerator,
          reason: input.reason,
        },
      },
      tx,
    );
  });

  return { slug: community.slug };
}
