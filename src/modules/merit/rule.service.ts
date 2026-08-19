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

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const EDITABLE = ["label", "points", "category", "description"] as const;

/**
 * 규정 수정. track·kind는 인자에 없다 — 생성 시 고정이다.
 * 바뀐 항목이 없으면 쓰지도 기록하지도 않는다.
 */
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
        // 이미 나간 기록은 스냅샷이라 안 바뀐다 — 그래도 전/후를 남겨야
        // "왜 이 학생만 3점이지"를 나중에 설명할 수 있다.
        pointsFrom: current.points,
        pointsTo: next.points,
      },
    }, tx);
  });
}

/**
 * 규정 삭제. 목록과 부여 선택지에서 빠지되 행 자체는 남는다.
 * 이미 지워진 규정이면 아무 일도 하지 않는다 — 감사로그가 두 줄 쌓이지 않게.
 */
export async function deleteRule(
  actor: SessionUser,
  input: DeleteRuleInput,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  await withTransaction(async (tx) => {
    const current = await repo.findRule(input.ruleId, tx);
    if (!current) throw new MeritError("RULE_NOT_FOUND");
    // 이미 지운 규정에 사유만 새로 남기지 않는다 — 삭제는 한 번만 일어난 일이다.
    if (!current.active) return;
    if (current.updatedAt.getTime() !== input.updatedAt.getTime()) {
      throw new MeritError("RULE_CONFLICT");
    }

    const deleted = await repo.markRuleDeleted(input.ruleId, input.updatedAt, tx);
    if (deleted === 0) {
      // 동시 삭제는 먼저 성공한 요청 한 건만 감사한다. 반면 동시 수정이면
      // 최신 규정을 지우지 말고 화면을 새로 읽게 한다.
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

/**
 * 부여 화면의 선택지. `merit:award`로 막는다 — 규정 관리 권한이 아니다.
 * 나중에 부여만 열 때 이 구분이 없으면 규정 관리 권한을 함께 줘야 한다.
 */
export async function listActiveRules(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:award");
  return repo.listActiveRules(track);
}
