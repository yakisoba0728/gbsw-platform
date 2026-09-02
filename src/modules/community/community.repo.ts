import { prisma, type DbClient } from "@/core/db/client";
import type { Community } from "@/generated/prisma/client";
import type { CreateCommunityInput } from "./community.schema";

export type CommunityRow = Community;

const COMMUNITY_ORDER = [{ sortOrder: "asc" }, { name: "asc" }] as const;

export function listCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({
    where: { active: true },
    orderBy: [...COMMUNITY_ORDER],
  });
}

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

export function listAllCommunities(db: DbClient = prisma): Promise<CommunityRow[]> {
  return db.community.findMany({ orderBy: [{ active: "desc" }, ...COMMUNITY_ORDER] });
}

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

type CommunityPatch = {
  name: string;
  description: string | null;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: number;
};

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

const POST_WITH_COUNTS = {
  include: { _count: { select: { comments: { where: { deletedAt: null } } } } },
} as const;

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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    ...POST_WITH_COUNTS,
  });
}

export function listRecentPostsAcross(
  communityIds: readonly string[],
  take: number,
  db: DbClient = prisma,
) {
  return db.communityPost.findMany({
    where: { communityId: { in: [...communityIds] }, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...POST_WITH_COUNTS,
  });
}

export function findPost(id: string, db: DbClient = prisma) {
  return db.communityPost.findUnique({
    where: { id },
    include: { community: true },
  });
}

type NewPost = {
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

export async function markPostDeleted(
  id: string,
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityPost.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

export async function attachToPost(
  ids: string[],
  postId: string,
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  if (ids.length === 0) return 0;
  // 이미 이 글에 붙은 행도 updateMany 건수에 포함된다.
  const result = await db.communityAttachment.updateMany({
    where: {
      id: { in: ids },
      uploaderUserId,
      OR: [{ postId: null }, { postId }],
    },
    data: { postId },
  });
  return result.count;
}

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

export function listComments(postId: string, db: DbClient = prisma) {
  return db.communityComment.findMany({
    where: { postId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

export function findComment(id: string, db: DbClient = prisma) {
  return db.communityComment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}

type NewComment = {
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
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.communityComment.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

export function countPending(
  uploaderUserId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.communityAttachment.count({ where: { uploaderUserId, postId: null } });
}

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
    select: {
      id: true,
      storageKey: true,
      filename: true,
      uploaderUserId: true,
      createdAt: true,
    },
  });
}

export async function deleteAttachments(
  ids: string[],
  db: DbClient = prisma,
): Promise<void> {
  if (ids.length === 0) return;
  await db.communityAttachment.deleteMany({ where: { id: { in: ids } } });
}

type NewAttachment = {
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

export function findAttachmentForDownload(id: string, db: DbClient = prisma) {
  return db.communityAttachment.findUnique({
    where: { id },
    include: { post: { include: { community: true } } },
  });
}
