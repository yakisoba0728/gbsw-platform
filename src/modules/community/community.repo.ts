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
