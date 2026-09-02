import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import type { MeritTrack } from "@/core/authz/merit-track";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import type {
  CreateRuleInput,
  DeleteRuleInput,
  UpdateRuleInput,
} from "./merit.schema";

export async function createRule(
  actor: SessionUser,
  input: CreateRuleInput,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  await withTransaction(async (tx) => {
    const { id } = await repo.createRule(input, tx);

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:rule:create",
      targetType: "MeritRule",
      targetId: id,
      metadata: {
        track: input.track,
        kind: input.kind,
        label: input.label,
        points: input.points,
      },
    }, tx);
  });
}

const EDITABLE = ["label", "points", "category", "description"] as const;

export async function updateRule(
  actor: SessionUser,
  input: UpdateRuleInput,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  const current = await repo.findRule(input.ruleId);
  if (!current) throw new MeritError("RULE_NOT_FOUND");

  const next = {
    label: input.label,
    points: input.points,
    category: input.category,
    description: input.description,
  };

  const changed = EDITABLE.filter((field) => current[field] !== next[field]);
  if (changed.length === 0) return;

  await withTransaction(async (tx) => {
    const updated = await repo.updateRule(
      input.ruleId,
      next,
      input.updatedAt,
      tx,
    );
    if (!updated) throw new MeritError("RULE_CONFLICT");

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:rule:update",
      targetType: "MeritRule",
      targetId: input.ruleId,
      metadata: {
        changed,
        label: next.label,
        pointsFrom: current.points,
        pointsTo: next.points,
      },
    }, tx);
  });
}

export async function deleteRule(
  actor: SessionUser,
  input: DeleteRuleInput,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  await withTransaction(async (tx) => {
    const current = await repo.findRule(input.ruleId, tx);
    if (!current) throw new MeritError("RULE_NOT_FOUND");
    if (!current.active) return;
    if (current.updatedAt.getTime() !== input.updatedAt.getTime()) {
      throw new MeritError("RULE_CONFLICT");
    }

    const deleted = await repo.markRuleDeleted(input.ruleId, input.updatedAt, tx);
    if (deleted === 0) {
      const latest = await repo.findRule(input.ruleId, tx);
      if (latest?.active) throw new MeritError("RULE_CONFLICT");
      return;
    }

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:rule:delete",
      targetType: "MeritRule",
      targetId: input.ruleId,
      metadata: {
        track: current.track,
        kind: current.kind,
        label: current.label,
        points: current.points,
        reason: input.reason,
      },
    }, tx);
  });
}

export async function listRules(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:rule:manage");
  return repo.listRules(track);
}

export async function listRulesForReading(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:rule:read");
  return repo.listRules(track);
}

export async function listActiveRules(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:award");
  return repo.listActiveRules(track);
}
