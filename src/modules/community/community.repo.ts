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

/**
 * 목록 한 줄. **`community.view.ts`의 `PostRow`와 이름이 겹치지 않게 한다** —
 * 그쪽은 뷰 변환기가 받는 최소 모양이고, 이쪽은 댓글 수까지 붙은 조회 결과다.
 * 두 이름이 같으면 `post.service.ts`가 둘 다 import하는 자리에서 무엇이
 * 무엇인지 읽히지 않는다.
 */
export type PostWithCounts = Awaited<ReturnType<typeof listPosts>>[number];

/** 지워진 글은 세지 않는다. 페이지 수 계산이 화면과 어긋나면 빈 쪽이 생긴다. */
export function countPosts(communityId: string, db: DbClient = prisma): Promise<number> {
  return db.communityPost.count({ where: { communityId, deletedAt: null } });
}

export function listPosts(
  communityId: string,
  skip: number,
  take: number,
  db: DbClient = prisma,
) {
  return db.communityPost.findMany({
    where: { communityId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    skip,
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
export type DetachedFile = { storageKey: string; createdAt: Date };

export async function detachFromPost(
  postId: string,
  keepIds: string[],
  db: DbClient = prisma,
): Promise<DetachedFile[]> {
  const doomed = await db.communityAttachment.findMany({
    // notIn에 빈 배열을 주면 Prisma가 조건을 통째로 무시한다 — 그러면 남길
    // 것이 없다는 뜻인데 아무것도 안 지운다. 절대 안 맞는 id를 하나 세운다.
    where: { postId, id: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] } },
    select: { id: true, storageKey: true, createdAt: true },
  });
  if (doomed.length === 0) return [];
  await db.communityAttachment.deleteMany({
    where: { id: { in: doomed.map((a) => a.id) } },
  });
  return doomed.map(({ storageKey, createdAt }) => ({ storageKey, createdAt }));
}

export function listAttachments(postId: string, db: DbClient = prisma) {
  return db.communityAttachment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, size: true },
  });
}
