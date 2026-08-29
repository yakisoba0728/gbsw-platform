import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { canRead, canWrite } from "./community.access";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import type {
  CreateCommunityInput,
  DeleteCommunityInput,
  UpdateCommunityInput,
} from "./community.schema";

/**
 * 게시판 자체를 다루는 서비스. 글·댓글·첨부는 각자의 서비스에 있다.
 *
 * **다른 서비스가 게시판을 집어 오는 문도 여기다** — `getReadableBySlug` ·
 * `getWritableBySlug`. 권한 판정과 "없앤 게시판" 판정을 한 곳에 모아 두면
 * 글 서비스와 첨부 서비스가 같은 검사를 각자 다시 적지 않는다.
 */

/**
 * `can()`으로 못 가르는 거부. `assertCan`과 같은 모양으로 기록하고 던진다 —
 * 게시판별 권한은 행 데이터라 Action 표에 없다.
 * (invite.service.ts의 revokeInvite가 소유권 검사에서 쓰는 것과 같은 길이다.)
 */
async function denyAccess(
  actor: SessionUser,
  action: string,
  slug: string,
): Promise<never> {
  try {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "authz:denied",
      targetType: "Community",
      metadata: { action, slug },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError(action);
}

/** Prisma의 유니크 위반. slug가 유일한 유니크 열이라 이것뿐이다. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function createCommunity(
  actor: SessionUser,
  input: CreateCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  await withTransaction(async (tx) => {
    let id: string;
    try {
      ({ id } = await repo.createCommunity(input, tx));
    } catch (error) {
      if (isUniqueViolation(error)) throw new CommunityError("SLUG_TAKEN");
      throw error;
    }

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:create",
        targetType: "Community",
        targetId: id,
        metadata: {
          slug: input.slug,
          name: input.name,
          readRoles: input.readRoles,
          writeRoles: input.writeRoles,
          anonymous: input.anonymous,
        },
      },
      tx,
    );
  });
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const EDITABLE = [
  "name",
  "description",
  "anonymous",
  "allowAttachments",
  "sortOrder",
] as const;

export async function updateCommunity(
  actor: SessionUser,
  input: UpdateCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  const current = await repo.findCommunity(input.communityId);
  if (!current) throw new CommunityError("COMMUNITY_NOT_FOUND");

  const next = {
    name: input.name,
    description: input.description,
    readRoles: input.readRoles,
    writeRoles: input.writeRoles,
    anonymous: input.anonymous,
    allowAttachments: input.allowAttachments,
    sortOrder: input.sortOrder,
  };

  // **익명은 되돌릴 수 없다.** 끄는 순간 이미 쌓인 모든 글·댓글의 작성자가
  // 목록과 상세에 그대로 뜬다 — 뷰 변환기가 저장된 이름을 지금의 플래그로만
  // 가리기 때문이다. 학생은 「작성자가 화면에 보이지 않습니다」라는 안내를 보고
  // 썼고, 그 약속을 체크박스 하나로 깨는 길을 두지 않는다.
  //
  // 켜는 것은 된다 — 이름이 더 감춰질 뿐 드러나지 않는다. 실명으로 쓴 사람이
  // 익명이 되는 것도 약속을 어기는 것은 아니다.
  if (current.anonymous && !next.anonymous) {
    throw new CommunityError("ANONYMOUS_IRREVERSIBLE");
  }

  const changed: string[] = EDITABLE.filter((field) => current[field] !== next[field]);
  if (!sameRoles(current.readRoles, next.readRoles)) changed.push("readRoles");
  if (!sameRoles(current.writeRoles, next.writeRoles)) changed.push("writeRoles");
  // 바뀐 것이 없으면 쓰지도 기록하지도 않는다 — 저장 버튼을 두 번 눌러도
  // 감사로그가 두 줄 쌓이지 않게 (rule.service.updateRule과 같은 판단).
  if (changed.length === 0) return;

  await withTransaction(async (tx) => {
    const ok = await repo.updateCommunity(input.communityId, next, input.updatedAt, tx);
    if (!ok) throw new CommunityError("COMMUNITY_CONFLICT");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:update",
        targetType: "Community",
        targetId: input.communityId,
        metadata: {
          slug: current.slug,
          changed,
          // 권한은 전/후를 늘 남긴다 — "언제부터 학부모가 볼 수 있었나"는
          // 나중에 반드시 묻게 되는 질문이다.
          readRolesFrom: current.readRoles,
          readRolesTo: next.readRoles,
          writeRolesFrom: current.writeRoles,
          writeRolesTo: next.writeRoles,
          // 익명은 켜는 것만 되지만, 언제 켜졌는지는 남아야 한다.
          anonymousFrom: current.anonymous,
          anonymousTo: next.anonymous,
        },
      },
      tx,
    );
  });
}

/** 순서가 달라도 같은 집합이면 안 바뀐 것이다. 폼이 체크 순서대로 보낸다. */
function sameRoles(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export async function deleteCommunity(
  actor: SessionUser,
  input: DeleteCommunityInput,
): Promise<void> {
  await assertCan(actor, "community:manage");

  await withTransaction(async (tx) => {
    const current = await repo.findCommunity(input.communityId, tx);
    if (!current) throw new CommunityError("COMMUNITY_NOT_FOUND");
    // 이미 없앤 게시판에 사유만 새로 남기지 않는다 — 제거는 한 번만 일어난 일이다.
    if (!current.active) return;

    const removed = await repo.markCommunityDeleted(
      input.communityId,
      input.updatedAt,
      tx,
    );
    if (removed === 0) throw new CommunityError("COMMUNITY_CONFLICT");

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: "community:delete",
        targetType: "Community",
        targetId: input.communityId,
        metadata: { slug: current.slug, name: current.name, reason: input.reason },
      },
      tx,
    );
  });
}

/** 관리 화면. 없앤 게시판도 함께 준다. */
export async function listForManage(actor: SessionUser): Promise<repo.CommunityRow[]> {
  await assertCan(actor, "community:manage");
  return repo.listAllCommunities();
}

/** 내가 읽을 수 있는 게시판만. 못 읽는 게시판은 목록에 이름도 안 나온다. */
export async function listReadable(actor: SessionUser): Promise<repo.CommunityRow[]> {
  const all = await repo.listCommunities();
  return all.filter((community) => canRead(actor, community));
}

/** 목록 화면 한 줄. 게시판 성질에 「얼마나 도는 곳인가」를 더한 것이다. */
export type ReadableBoard = repo.CommunityRow & {
  postCount: number;
  /** 마지막 글이 올라온 때. 글이 없으면 null. */
  lastPostAt: Date | null;
};

/**
 * 목록 화면용. 읽을 수 있는 게시판에 글 수와 마지막 글 시각을 얹는다.
 *
 * 활동을 함께 주는 이유는, 이름과 설명만 적힌 카드로는 어디에 들어가야 할지
 * 고를 수가 없어서다 — 게시판이 셋이든 열이든 화면이 똑같아 보인다.
 */
export async function listReadableWithActivity(
  actor: SessionUser,
): Promise<ReadableBoard[]> {
  const all = await repo.listCommunitiesWithActivity();
  return all
    .filter((community) => canRead(actor, community))
    .map(({ _count, posts, ...community }) => ({
      ...community,
      postCount: _count.posts,
      lastPostAt: posts[0]?.createdAt ?? null,
    }));
}

/**
 * 주소로 집어 온다. 읽을 수 없으면 거부하고, 없앤 게시판은 없는 것으로 친다.
 *
 * **없앤 게시판을 교사에게도 COMMUNITY_NOT_FOUND로 주는 이유**는, 그 주소가
 * 살아 있으면 없앴다는 사실이 화면에서 반쯤만 참이 되어서다. 관리 화면에서는
 * `listForManage`로 여전히 보인다.
 */
export async function getReadableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await repo.findCommunityBySlug(slug);
  if (!community || !community.active) throw new CommunityError("COMMUNITY_NOT_FOUND");
  if (!canRead(actor, community)) await denyAccess(actor, "community:read", slug);
  return community;
}

/** 쓰기 문. 읽기까지 함께 본다 — 못 읽는 곳에 쓰는 일은 없다. */
export async function getWritableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await getReadableBySlug(actor, slug);
  if (!canWrite(actor, community)) await denyAccess(actor, "community:write", slug);
  return community;
}
