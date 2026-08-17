import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { assertCan } from "@/core/authz/errors";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./enrollment.repo";
import type { EnrollmentChange } from "./enrollment.schema";

export class EnrollmentError extends Error {
  /** 학생 이름처럼 코드로 미리 정할 수 없는 내용. 있으면 화면이 그대로 보여준다. */
  detail?: string;

  constructor(code: string, detail?: string) {
    super(code);
    this.detail = detail;
  }
}

export async function listStudents(actor: SessionUser) {
  await assertCan(actor, "student:manage");
  return repo.listByYear(await getCurrentYear());
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const FIELDS = ["grade", "classNo", "number", "status"] as const;

/** "1학년 3반 3번" — 충돌 오류에 자리를 사람이 읽게 적을 때 쓴다. */
function formatSlot(grade: number, classNo: number, number: number): string {
  return `${grade}학년 ${classNo}반 ${number}번`;
}

/** 재학으로 저장되는 (grade, classNo, number) — 아니면 null. 반·번호 충돌 검사에만 쓴다. */
function enrolledSlot(
  change: EnrollmentChange,
): { grade: number; classNo: number; number: number } | null {
  if (change.status !== "ENROLLED") return null;
  if (change.grade === null || change.classNo === null || change.number === null) {
    return null;
  }
  return { grade: change.grade, classNo: change.classNo, number: change.number };
}

/**
 * 표에서 고친 것을 한 번에 저장한다. 순서를 지킨다 — 검증 → 자리 충돌 검사 →
 * 단일 트랜잭션 저장 → 커밋 뒤 감사로그. 로그는 학생 1명당 1줄이고 batch로 묶인다.
 */
export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
  expectedYear: number,
): Promise<{ saved: number }> {
  await assertCan(actor, "student:manage");

  const year = await getCurrentYear();
  // 표가 그려진 뒤 다른 관리자가 학년도를 넘겼으면, 옛 학년도를 보고 만든 수정이
  // 새 학년도에 쓰이고 계정까지 잠긴다.
  if (year !== expectedYear) {
    throw new EnrollmentError("YEAR_MISMATCH");
  }

  const currentRows = await repo.listByYear(year);
  const byId = new Map(currentRows.map((r) => [r.studentProfileId, r]));

  // 같은 학생이 두 번 오면 마지막 값만 남긴다 — 감사로그가 두 줄 남으면 안 된다.
  const deduped = [...new Map(changes.map((c) => [c.studentProfileId, c])).values()];

  // 먼저 전부 검증한다. 절반만 저장되는 게 제일 나쁘다.
  const planned: {
    change: EnrollmentChange & { userId: string };
    active: boolean;
    changed: string[];
  }[] = [];

  for (const input of deduped) {
    const before = byId.get(input.studentProfileId);
    // 세션에서 유도할 수 없는 식별자라 반드시 대조한다.
    if (!before) throw new EnrollmentError("UNKNOWN_STUDENT");

    const enrolled = input.status === "ENROLLED";
    if (enrolled && (input.grade === null || input.classNo === null || input.number === null)) {
      throw new EnrollmentError("INCOMPLETE_ENROLLED");
    }

    // 재학이 아니면 반·번호를 지운다 — 졸업·자퇴에 반과 번호는 의미가 없다.
    const change = {
      ...input,
      grade: enrolled ? input.grade : null,
      classNo: enrolled ? input.classNo : null,
      number: enrolled ? input.number : null,
      userId: before.userId,
    };

    const changed = FIELDS.filter((f) => before[f] !== change[f]);
    if (changed.length === 0) continue;

    const active = keepsAccountActive(input.status);

    // 자기 자신을 비재학으로 돌리면 스스로를 영구 로그아웃시킨다. 승격된 관리자는
    // StudentProfile이 남아 있어 이 표에도 나올 수 있다.
    if (before.userId === actor.id && !active) {
      throw new EnrollmentError("CANNOT_DEACTIVATE_SELF");
    }

    planned.push({ change, active, changed });
  }

  if (planned.length === 0) return { saved: 0 };

  // 자리 충돌을 미리 검사해 DB 유일 제약에 닿기 전에 이름과 함께 반려한다.
  // 번호 맞바꾸기(3↔4)는 단일 트랜잭션으로도 못 푼다 — 유일 제약이 DEFERRABLE이
  // 아니라 문장 단위로 걸린다. 그 학생이 옮기는 중이어도 똑같이 반려한다.
  const targetOwner = new Map<string, string>();
  for (const { change } of planned) {
    const slot = enrolledSlot(change);
    if (!slot) continue;
    const key = `${slot.grade}-${slot.classNo}-${slot.number}`;
    const label = formatSlot(slot.grade, slot.classNo, slot.number);

    const dupInBatch = targetOwner.get(key);
    if (dupInBatch && dupInBatch !== change.studentProfileId) {
      const a = byId.get(dupInBatch)?.name ?? dupInBatch;
      const b = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
      throw new EnrollmentError(
        "ENROLLMENT_CONFLICT",
        `${label} 자리가 겹칩니다: ${a}, ${b}`,
      );
    }
    targetOwner.set(key, change.studentProfileId);

    const occupant = currentRows.find(
      (r) =>
        r.studentProfileId !== change.studentProfileId &&
        r.status === "ENROLLED" &&
        r.grade === slot.grade &&
        r.classNo === slot.classNo &&
        r.number === slot.number,
    );
    if (occupant) {
      const mover = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
      throw new EnrollmentError(
        "ENROLLMENT_CONFLICT",
        `${label} 자리가 겹칩니다: ${occupant.name}, ${mover}`,
      );
    }
  }

  const items: repo.PlannedEnrollment[] = planned.map(({ change, active, changed }) => ({
    ...change,
    accountActive: active,
    // status가 안 바뀌면 계정도 건드리지 않는다 — 번호만 고쳐도 잠긴 계정이 풀리면 안 된다.
    statusChanged: changed.includes("status"),
  }));

  try {
    await repo.applyAll(year, items);
  } catch (error) {
    if (error instanceof repo.NumberTakenError) {
      throw new EnrollmentError("NUMBER_TAKEN");
    }
    throw error;
  }

  // recordAudit은 위 트랜잭션에 못 끼므로 커밋 뒤에만 부른다. actorName을 넘겨
  // 학생 수만큼의 이름 재조회를 없앤다.
  const batch = randomUUID();
  for (const { change, active, changed } of planned) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "enrollment:update",
      targetType: "StudentProfile",
      targetId: change.studentProfileId,
      // 바뀐 값이 아니라 바뀐 항목 이름만. batch로 같은 저장임을 묶는다.
      metadata: { changed, batch, year },
    });

    // 계정 상태가 실제로 뒤집힐 때만 한 줄 더 남긴다. targetId는 userId여야
    // 계정 상세의 활동 기록이 이 줄을 찾는다.
    const before = byId.get(change.studentProfileId);
    if (changed.includes("status") && before && before.accountActive !== active) {
      await recordAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        action: active ? "user:activate" : "user:deactivate",
        targetType: "User",
        targetId: change.userId,
      });
    }
  }

  return { saved: planned.length };
}
