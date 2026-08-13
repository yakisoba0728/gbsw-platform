import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { can } from "@/core/authz/can";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./enrollment.repo";
import type { EnrollmentChange } from "./enrollment.schema";

export class EnrollmentError extends Error {}

export async function listStudents(actor: SessionUser) {
  if (!can(actor, "student:manage")) throw new Error("FORBIDDEN");
  return repo.listByYear(await getCurrentYear());
}

/** 감사로그에 이름을 남길 항목들. 순서가 곧 표시 순서다. */
const FIELDS = ["grade", "classNo", "number", "status"] as const;

/**
 * 표에서 고친 것을 한 번에 저장한다.
 *
 * 바뀐 줄만 쓴다. 표가 전체를 보내오더라도 여기서 현재 값과 대조해 걸러낸다 —
 * 안 그러면 아무것도 안 고치고 저장만 눌러도 전교생 감사로그가 쌓인다.
 *
 * 감사로그는 학생 1명당 1줄이다. 일괄 작업이어도 나중에 "이 학생이 왜 3반이 됐지"를
 * 추적하려면 건별이어야 한다. 같은 저장에 속한 줄은 batch로 묶어 본다.
 */
export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
): Promise<{ saved: number }> {
  if (!can(actor, "student:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const currentRows = await repo.listByYear(year);
  const byId = new Map(currentRows.map((r) => [r.studentProfileId, r]));

  // 먼저 전부 검증한다. 절반만 저장되는 게 제일 나쁘다.
  const planned: {
    change: EnrollmentChange & { userId: string };
    active: boolean;
    changed: string[];
  }[] = [];

  for (const input of changes) {
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

    const changed = FIELDS.filter(
      (f) => before[f] !== change[f],
    ) as unknown as string[];
    if (changed.length === 0) continue;

    planned.push({ change, active: keepsAccountActive(input.status), changed });
  }

  if (planned.length === 0) return { saved: 0 };

  const batch = randomUUID();

  for (const { change, active, changed } of planned) {
    try {
      await repo.applyChange(year, change, active);
    } catch (error) {
      if (error instanceof repo.NumberTakenError) {
        throw new EnrollmentError("NUMBER_TAKEN");
      }
      throw error;
    }

    await recordAudit({
      actorUserId: actor.id,
      action: "enrollment:update",
      targetType: "StudentProfile",
      targetId: change.studentProfileId,
      // 바뀐 값이 아니라 바뀐 항목 이름만. batch로 같은 저장임을 묶는다.
      metadata: { changed, batch, year },
    });
  }

  return { saved: planned.length };
}
