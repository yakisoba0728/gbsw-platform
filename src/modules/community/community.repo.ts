import { prisma, type DbClient } from "@/core/db/client";
import type { Community } from "@/generated/prisma/client";
import type { CreateCommunityInput } from "./community.schema";

/**
 * Prisma 호출만 있는 계층. 권한·감사·업무 판단은 서비스가 한다.
 *
 * 커뮤니티·글·댓글·첨부가 한 파일에 있다 — merit이 repo 하나에 규정·부여·통계를
 * 모두 담은 것과 같은 규약이다. 서비스는 책임별로 나뉘지만 repo는 하나다.
 */

export type CommunityRow = Community;

/** 목록 정렬은 한 곳에서만 정한다 — 화면마다 다르면 게시판 순서가 화면마다 달라진다. */
const COMMUNITY_ORDER = [{ sortOrder: "asc" }, { name: "asc" }] as const;

/** 살아 있는 게시판만. 화면 대부분이 이걸 쓴다. */
export function listCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({
    where: { active: true },
    orderBy: [...COMMUNITY_ORDER],
  });
}

/**
 * 살아 있는 게시판 + 활동. 목록 화면이 「글이 얼마나 있고 마지막이 언제인가」를
 * 적으려면 게시판마다 세어야 하는데, 게시판 수만큼 질의를 내지 않으려고 한 번에
 * 가져온다.
 *
 * `posts`는 **날짜 하나만** 가져온다 — 제목이나 작성자를 실으면 못 읽는 사람의
 * 화면으로 내려갈 길이 생기고, 익명 게시판에서는 그것이 곧 신원이다.
 */
export function listCommunitiesWithActivity(db: DbClient = prisma) {
  return db.community.findMany({
    where: { active: true },
    orderBy: [...COMMUNITY_ORDER],
    include: {
      _count: { select: { posts: { where: { deletedAt: null } } } },
      posts: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
}

/** 없앤 것까지. 관리 화면만 쓴다 — 되살릴 수는 없어도 있었다는 사실은 보여야 한다. */
export function listAllCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({ orderBy: [{ active: "desc" }, ...COMMUNITY_ORDER] });
}

/**
 * 주소로 찾는다. **없앤 게시판도 돌려준다** — active 판정은 서비스가 한다.
 * repo가 걸러 버리면 서비스가 "없는 게시판"과 "없앤 게시판"을 구분하지 못한다.
 */
export function findCommunityBySlug(
  slug: string,
  db: DbClient = prisma,
): Promise<CommunityRow | null> {
  return db.community.findUnique({ where: { slug } });
}

export function findCommunity(
  id: string,
  db: DbClient = prisma,
): Promise<CommunityRow | null> {
  return db.community.findUnique({ where: { id } });
}

export async function createCommunity(
  input: CreateCommunityInput,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  const created = await db.community.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description,
      readRoles: input.readRoles,
      writeRoles: input.writeRoles,
      anonymous: input.anonymous,
      allowAttachments: input.allowAttachments,
      sortOrder: input.sortOrder,
    },
    select: { id: true },
  });
  return created;
}

/** 수정할 수 있는 항목. slug는 없다 — 만든 뒤에는 바꿀 수 없다. */
export type CommunityPatch = {
  name: string;
  description: string | null;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: number;
};

/**
 * 낙관적 잠금. 화면이 읽은 시점의 updatedAt이 DB와 같을 때만 쓴다.
 * false를 돌려주면 그 사이 누가 바꾼 것이다 — 서비스가 CONFLICT로 올린다.
 */
export async function updateCommunity(
  id: string,
  data: CommunityPatch,
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const result = await db.community.updateMany({
    where: { id, updatedAt },
    data,
  });
  return result.count === 1;
}

/** 없앤다. 행은 남는다 — 글이 매달려 있다. 이미 없앤 것이면 0을 돌려준다. */
export async function markCommunityDeleted(
  id: string,
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.community.updateMany({
    where: { id, updatedAt, active: true },
    data: { active: false },
  });
  return result.count;
}

// ── 글 ────────────────────────────────────────────────────────

/** 목록에서 함께 읽는 것 — 지워지지 않은 댓글 수. */
const POST_WITH_COUNTS = {
  include: { _count: { select: { comments: { where: { deletedAt: null } } } } },
} as const;

/** 지워진 글은 세지 않는다. 페이지 수 계산이 화면과 어긋나면 빈 쪽이 생긴다. */
export function countPosts(communityId: string, db: DbClient = prisma): Promise<number> {
  return db.communityPost.count({ where: { communityId, deletedAt: null } });
}

/** 댓글 수까지 붙인 목록을 읽는다. 뷰 변환기의 최소 입력 모양은 community.view.ts가 정한다. */
export function listPosts(
  communityId: string,
  skip: number,
  take: number,
  db: DbClient = prisma,
) {
  return db.communityPost.findMany({
    where: { communityId, deletedAt: null },
    // offset 페이지는 정렬키가 유일해야 페이지 경계가 고정된다. 같은 트랜잭션에서
    // 만든 글은 createdAt이 모두 같을 수 있으므로 id로 동점을 끊는다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    ...POST_WITH_COUNTS,
  });
}

/**
 * 여러 게시판을 가로지르는 최근 글. 대시보드의 「새 글」 한 칸이 쓴다.
 *
 * **어느 게시판을 볼지는 서비스가 정해서 넘긴다.** 여기서 권한을 보지 않는다 —
 * repo는 Prisma 호출만 한다. 빈 배열을 그대로 넘기면 `in: []`이 되어 전부
 * 걸러지므로, 부르는 쪽이 먼저 걸러야 한다.
 */
export function listRecentPostsAcross(
  communityIds: readonly string[],
  take: number,
  db: DbClient = prisma,
) {
  return db.communityPost.findMany({
    where: { communityId: { in: [...communityIds] }, deletedAt: null },
    // 목록과 같은 정렬키다. 보조키(id)까지 같은 이유는 findRecentAwardPage와 같다 —
    // 같은 밀리초에 들어온 글 사이의 순서가 조회마다 뒤집히면 안 된다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...POST_WITH_COUNTS,
  });
}

/**
 * 한 건. **지워진 글도 돌려준다** — 서비스가 "없는 글"과 "지워진 글"을 갈라야
 * 한다. 게시판 행도 함께 읽는다: 익명 여부를 모르면 뷰 변환기를 부를 수 없고,
 * 두 번 왕복할 이유가 없다.
 */
export function findPost(id: string, db: DbClient = prisma) {
  return db.communityPost.findUnique({
    where: { id },
    include: { community: true },
  });
}

export type NewPost = {
  communityId: string;
  title: string;
  body: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
};

export async function createPost(
  data: NewPost,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.communityPost.create({ data, select: { id: true } });
}

/** 낙관적 잠금. false면 그 사이 누가 바꿨거나 글이 지워졌다. */
export async function updatePost(
  id: string,
  data: { title: string; body: string },
  updatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const result = await db.communityPost.updateMany({
    where: { id, updatedAt, deletedAt: null },
    data,
  });
  return result.count === 1;
}

/** 이미 지운 글이면 0. 감사로그가 두 줄 쌓이지 않게 서비스가 이 값을 본다. */
export async function markPostDeleted(
  id: string,
  actorUserId: string,
  reason: string | null,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityPost.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actorUserId, deletedReason: reason },
  });
  return result.count;
}

// ── 첨부 (붙이기·떼기·목록) ───────────────────────────────────

/**
 * 첨부를 글에 붙인다. **올린 사람이 글쓴이인 것만** — 남의 첨부 id를 폼에
 * 실어 보내도 조건에 안 걸려 붙지 않는다. 이미 붙은 것도 안 건드린다.
 * 실제로 붙은 개수를 돌려준다.
 */
export async function attachToPost(
  ids: string[],
  postId: string,
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.communityAttachment.updateMany({
    where: { id: { in: ids }, uploaderUserId, postId: null },
    data: { postId },
  });
  return result.count;
}

/**
 * 글 수정에서 빠진 첨부를 뗀다. **행을 지우고 디스크에서 찾을 값을 돌려준다** —
 * 부르는 쪽이 그것으로 파일을 지운다. `createdAt`까지 주는 이유는 디스크 경로가
 * 연·월로 나뉘어 있어(`storagePath`) 그 값 없이는 파일을 못 찾아서다.
 *
 * 디스크 삭제는 여기서 하지 않는다 — repo는 Prisma만 부른다.
 */
export type DetachedFile = {
  id: string;
  storageKey: string;
  filename: string;
  createdAt: Date;
};

export async function detachFromPost(
  postId: string,
  keepIds: string[],
  db: DbClient = prisma,
): Promise<DetachedFile[]> {
  const doomed = await db.communityAttachment.findMany({
    // 남길 것이 없으면(빈 배열) 이 글의 첨부가 전부 대상이다. `notIn: []`이
    // 런타임마다 다르게 읽힐 여지를 없애려고 절대 안 맞는 id를 하나 세운다.
    where: { postId, id: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] } },
    select: { id: true, storageKey: true, filename: true, createdAt: true },
  });
  if (doomed.length === 0) return [];
  await db.communityAttachment.deleteMany({
    where: { id: { in: doomed.map((a) => a.id) } },
  });
  return doomed;
}

export function listAttachments(postId: string, db: DbClient = prisma) {
  return db.communityAttachment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, size: true },
  });
}

// ── 댓글 ──────────────────────────────────────────────────────

export function listComments(postId: string, db: DbClient = prisma) {
  return db.communityComment.findMany({
    where: { postId, deletedAt: null },
    // 오래된 것부터 — 댓글은 대화라 위에서 아래로 읽힌다.
    orderBy: { createdAt: "asc" },
  });
}

/** 지워진 댓글도 돌려준다. 서비스가 "없음"과 "이미 지움"을 갈라야 한다. */
export function findComment(id: string, db: DbClient = prisma) {
  return db.communityComment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}

export type NewComment = {
  postId: string;
  body: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
};

export async function createComment(
  data: NewComment,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.communityComment.create({ data, select: { id: true } });
}

export async function markCommentDeleted(
  id: string,
  actorUserId: string,
  reason: string | null,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityComment.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedByUserId: actorUserId, deletedReason: reason },
  });
  return result.count;
}

// ── 첨부 (업로드·정리·내려받기) ───────────────────────────────

/** 아직 글에 안 붙은 내 첨부 수. 계정당 디스크 사용을 묶는 상한이 이 값을 본다. */
export function countPending(
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.communityAttachment.count({ where: { uploaderUserId, postId: null } });
}

/**
 * 미결 첨부 상한 판정의 직렬화 지점.
 *
 * 같은 사용자의 업로드는 이 User 행을 트랜잭션 끝까지 잠근 뒤 count+insert한다.
 * 그렇지 않으면 9개에서 시작한 병렬 요청들이 모두 10개 미만을 보고 각각 행을
 * 만들 수 있다. 첨부 행 자체를 잠그는 것으로는 아직 생기지 않은 다음 행을 막을
 * 수 없으므로, 모든 업로드가 반드시 가지고 있는 사용자 행을 잠근다.
 */
export async function lockAttachmentUploader(
  uploaderUserId: string,
  db: DbClient,
): Promise<void> {
  await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "user"
    WHERE "id" = ${uploaderUserId}
    FOR UPDATE
  `;
}

/**
 * 오래된 미결 첨부. **내 것과 「주인이 없는 것」을 함께 걷는다.**
 *
 * `uploaderUserId`는 계정이 완전 삭제되면 null이 된다(SetNull). 내 것만 훑으면
 * 그런 행은 누구의 정리에도 안 걸려 DB와 디스크에 영원히 남는다 — 글에 붙은
 * 첨부와 달리 이것들은 가리키는 글도 없어서 아무도 찾지 못한다.
 */
export function listStalePending(
  uploaderUserId: string,
  before: Date,
  db: DbClient = prisma,
) {
  return db.communityAttachment.findMany({
    where: {
      postId: null,
      createdAt: { lt: before },
      OR: [{ uploaderUserId }, { uploaderUserId: null }],
    },
    select: { id: true, storageKey: true, filename: true, createdAt: true },
  });
}

export async function deleteAttachments(
  ids: string[],
  db: DbClient = prisma,
): Promise<void> {
  if (ids.length === 0) return;
  await db.communityAttachment.deleteMany({ where: { id: { in: ids } } });
}

export type NewAttachment = {
  uploaderUserId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
};

export async function createAttachment(
  data: NewAttachment,
  db: DbClient = prisma,
): Promise<{ id: string; createdAt: Date }> {
  return db.communityAttachment.create({
    data,
    select: { id: true, createdAt: true },
  });
}

/**
 * 내려받기용. 글과 게시판까지 함께 읽는다 — 권한을 판정하려면 게시판이,
 * 지워진 글인지 보려면 글이 필요하고, 두 번 왕복할 이유가 없다.
 */
export function findAttachmentForDownload(id: string, db: DbClient = prisma) {
  return db.communityAttachment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}
