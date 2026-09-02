import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { canRead, canWrite } from "./community.access";
import { CommunityError } from "./community.error";
import * as repo from "./community.repo";
import type {
  CreateCommunityInput,
  DeleteCommunityInput,
  UpdateCommunityInput,
} from "./community.schema";

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

  // 실명 전환으로 기존 익명 작성자가 드러나지 않도록 한다.
  if (current.anonymous && !next.anonymous) {
    throw new CommunityError("ANONYMOUS_IRREVERSIBLE");
  }

  const changed: string[] = EDITABLE.filter((field) => current[field] !== next[field]);
  if (!sameRoles(current.readRoles, next.readRoles)) changed.push("readRoles");
  if (!sameRoles(current.writeRoles, next.writeRoles)) changed.push("writeRoles");
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
          readRolesFrom: current.readRoles,
          readRolesTo: next.readRoles,
          writeRolesFrom: current.writeRoles,
          writeRolesTo: next.writeRoles,
          anonymousFrom: current.anonymous,
          anonymousTo: next.anonymous,
        },
      },
      tx,
    );
  });
}

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

export async function listForManage(actor: SessionUser): Promise<repo.CommunityRow[]> {
  await assertCan(actor, "community:manage");
  return repo.listAllCommunities();
}

export async function listReadable(actor: SessionUser): Promise<repo.CommunityRow[]> {
  const all = await repo.listCommunities();
  return all.filter((community) => canRead(actor, community));
}

export type ReadableBoard = repo.CommunityRow & {
  postCount: number;
  lastPostAt: Date | null;
};

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

export async function getReadableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await repo.findCommunityBySlug(slug);
  if (!community || !community.active) throw new CommunityError("COMMUNITY_NOT_FOUND");
  if (!canRead(actor, community)) {
    await denyAccess(actor, "community:read", {
      targetType: "Community",
      actorName: actor.name,
      metadata: { slug },
    });
  }
  return community;
}

export async function getWritableBySlug(
  actor: SessionUser,
  slug: string,
): Promise<repo.CommunityRow> {
  const community = await getReadableBySlug(actor, slug);
  if (!canWrite(actor, community)) {
    await denyAccess(actor, "community:write", {
      targetType: "Community",
      actorName: actor.name,
      metadata: { slug },
    });
  }
  return community;
}
