import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import type { MeritTrack } from "@/core/authz/merit-track";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import type { CreateRuleInput, UpdateRuleInput } from "./merit.schema";

export async function createRule(
  actor: SessionUser,
  input: CreateRuleInput,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  const { id } = await repo.createRule(input);

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
  });
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const EDITABLE = ["label", "points", "category", "description"] as const;

/**
 * 규정 수정. **track·kind는 인자에 없다** — 생성 시 고정이다 (merit.schema.ts 참고).
 *
 * 실제로 바뀐 항목이 없으면 쓰지도, 기록하지도 않는다. 안 그러면 저장만 눌러도
 * 감사로그가 쌓인다 (enrollment.service.saveEnrollments와 같은 원칙).
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

  await repo.updateRule(input.ruleId, next);

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:rule:update",
    targetType: "MeritRule",
    targetId: input.ruleId,
    metadata: {
      changed,
      label: next.label,
      // 점수 변경은 앞으로 나갈 부여에만 영향을 준다 — 이미 나간 기록은
      // 스냅샷이라 안 바뀐다. 그래도 전/후를 남겨야 "왜 이 학생만 3점이지"를
      // 나중에 설명할 수 있다.
      pointsFrom: current.points,
      pointsTo: next.points,
    },
  });
}

/** 이미 비활성이면 아무 일도 하지 않는다 — 같은 버튼을 두 번 눌러도 로그가 안 쌓인다. */
export async function deactivateRule(
  actor: SessionUser,
  ruleId: string,
): Promise<void> {
  await assertCan(actor, "merit:rule:manage");

  const current = await repo.findRule(ruleId);
  if (!current) throw new MeritError("RULE_NOT_FOUND");
  if (!current.active) return;

  await repo.deactivateRule(ruleId);

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:rule:deactivate",
    targetType: "MeritRule",
    targetId: ruleId,
    metadata: { track: current.track, label: current.label },
  });
}

export async function listRules(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:rule:manage");
  return repo.listRules(track);
}

/**
 * 부여 화면의 선택지. **`merit:award`로 막는다** — 규정 관리 권한이 아니다.
 * 지금은 둘 다 관리자 전용이라 결과가 같지만, 나중에 부여만 열 때
 * 이 구분이 없으면 규정 관리 권한을 함께 줘야 한다.
 */
export async function listActiveRules(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:award");
  return repo.listActiveRules(track);
}
