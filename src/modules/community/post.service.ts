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
 * 글 한 건 + 그 게시판. **게시판 권한을 board.service에 다시 물어본다** —
 * 글에서 게시판으로 거슬러 왔다고 검사를 건너뛰면, 주소만 알면 남의 게시판
 * 글이 열린다.
 *
 * **문은 부르는 쪽이 고른다.** 새 내용을 밀어 넣는 수정은 새 글과 같은 쓰기
 * 문을 지나야 한다 — 교사가 게시판을 읽기 전용으로 얼려도 얼기 전에 글을 쓴
 * 사람만 제목·본문을 계속 갈아 끼울 수 있으면 그 게시판은 얼지 않은 것이다.
 * **삭제(`deletePost`)는 읽기 문 그대로 둔다** — 얼린 게시판에서 자기 글을
 * 거두는 것은 새 내용을 밀어 넣는 일이 아니다. 셋을 같은 문으로 되돌리지 않는다.
 */
async function loadPost(
  actor: SessionUser,
  postId: string,
  gate: "read" | "write" = "read",
) {
  const post = await repo.findPost(postId);
  // 지워진 글은 "없는 글"이다 — 교사에게도. 있었다는 사실은 감사로그가 안다.
  if (!post || post.deletedAt) throw new CommunityError("POST_NOT_FOUND");
  const community =
    gate === "write"
      ? await board.getWritableBySlug(actor, post.community.slug)
      : await board.getReadableBySlug(actor, post.community.slug);
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

/** 대시보드의 「새 글」 한 줄. 게시판 이름을 함께 준다 — 여러 게시판이 섞이므로. */
export type RecentPostView = PostListItemView & {
  communitySlug: string;
  communityName: string;
};

/**
 * 읽을 수 있는 게시판을 가로지르는 최근 글.
 *
 * **볼 수 있는 게시판을 먼저 정하고 그 안에서만 찾는다.** 글을 먼저 모아
 * 놓고 거르면 「못 보는 게시판의 글 3건」이 빠진 자리가 목록의 길이로 드러난다.
 *
 * 익명 게시판이 섞이므로 행을 그대로 넘기지 않는다 — `toPostListItem`이
 * 게시판마다 제 익명 설정으로 작성자를 지운다.
 */
export async function listRecentPosts(
  actor: SessionUser,
  take: number,
): Promise<RecentPostView[]> {
  const communities = await board.listReadable(actor);
  if (communities.length === 0) return [];

  const byId = new Map(communities.map((c) => [c.id, c]));
  const rows = await repo.listRecentPostsAcross([...byId.keys()], take);

  return rows.map((row) => {
    // in 절로 찾아온 행이라 반드시 있다.
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
        // 계정이 지워져도 남을 스냅샷. 익명 게시판에서도 저장한다 —
        // 가리는 일은 화면 앞의 community.view.ts가 한다.
        authorName: actor.name,
        authorRole: actor.role ?? "",
      },
      tx,
    );

    // 같은 id가 두 번 실려 와도 붙는 행은 하나다 — 아래 개수 비교가 맞으려면
    // 보낸 쪽도 한 번으로 세야 한다.
    const requested = [...new Set(input.attachmentIds)];
    const attached = await repo.attachToPost(requested, id, actor.id, tx);
    // **한 개라도 못 붙으면 막는다.** 남의 첨부이거나 이미 만료된 것이다 —
    // 고아 정리(`attachment.service`)가 업로드마다 먼저 돌아 한 시간 넘은 미결
    // 첨부를 지우므로, 「하나도 안 붙었나」만 보면 화면이 들고 있던 첨부 일부가
    // 사라진 채로 글이 조용히 저장된다.
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
  // 새 글과 같은 쓰기 문을 지난다 — 읽기 문으로 두면 읽기 전용으로 얼린
  // 게시판에서도 옛 글쓴이만 본문을 통째로 갈아 끼울 수 있다.
  const { post, community } = await loadPost(actor, input.postId, "write");

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

    // 이미 이 글에 붙어 있는 첨부는 다시 붙지 않으므로(`attachToPost`가
    // `postId: null`인 행만 고른다) 붙은 개수만으로는 「그대로 둔 첨부」와
    // 「사라진 첨부」를 못 가른다. 붙어 있던 것을 먼저 세어 둔다 — attach보다
    // 뒤에 세면 방금 붙인 것까지 함께 세어진다.
    const existingIds = new Set(
      (await repo.listAttachments(input.postId, tx)).map((a) => a.id),
    );
    const requested = [...new Set(input.attachmentIds)];
    const kept = requested.filter((id) => existingIds.has(id)).length;

    const attached = await repo.attachToPost(requested, input.postId, actor.id, tx);
    // 새 글과 같은 검사다 — 고아 정리가 그 사이 지운 첨부를 조용히 통과시키면
    // 「일부만 사라진 글」이 오류도 안내도 없이 저장된다.
    if (kept + attached !== requested.length) {
      throw new CommunityError("ATTACHMENT_NOT_FOUND");
    }

    // 뗀 파일은 트랜잭션 밖에서 지운다 — 롤백되면 행은 살아 있는데 파일만
    // 사라진다.
    //
    // **첨부를 안 받게 바뀐 게시판에서는 떼지 않는다.** 그런 게시판의 수정
    // 화면은 첨부칸 자체를 안 그려 `attachmentIds`가 빈 채로 오는데, 그것을
    // 「전부 뺐다」로 읽으면 오타 하나 고친 저장이 기존 첨부를 디스크째 지운다 —
    // 이 모듈에서 되돌릴 수 없는 유일한 삭제다.
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
