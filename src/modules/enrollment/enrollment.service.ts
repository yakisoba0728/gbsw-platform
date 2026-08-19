import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
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
 * 단일 트랜잭션 저장 + 감사로그. 로그는 학생 1명당 1줄이고 batch로 묶인다.
 */
export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
  expectedYear: number,
): Promise<{ saved: number }> {
  await assertCan(actor, "student:manage");

  // 같은 학생이 두 번 오면 마지막 값만 남긴다 — 감사로그가 두 줄 남으면 안 된다.
  const deduped = [...new Map(changes.map((c) => [c.studentProfileId, c])).values()];
  const batch = randomUUID();

  try {
    const saved = await withTransaction(
      async (tx) => {
        // 학년도 대조, 현재값 읽기, 변경 계획, 쓰기와 감사로그를 한 Serializable
        // 트랜잭션에 둔다. 그래야 두 관리자가 같은 행을 보고 모두 성공하지 않는다.
        const year = await repo.findCurrentYear(tx);
        if (year !== expectedYear) throw new EnrollmentError("YEAR_MISMATCH");

        const currentRows = await repo.listByYear(year, tx);
        const byId = new Map(currentRows.map((row) => [row.studentProfileId, row]));
        const planned: {
          change: EnrollmentChange & { userId: string };
          active: boolean;
          changed: string[];
        }[] = [];

        for (const input of deduped) {
          const before = byId.get(input.studentProfileId);
          if (!before) throw new EnrollmentError("UNKNOWN_STUDENT");

          const actualRevision = before.enrollmentUpdatedAt?.getTime() ?? null;
          const expectedRevision = input.expectedUpdatedAt?.getTime() ?? null;
          if (actualRevision !== expectedRevision) {
            throw new EnrollmentError("ENROLLMENT_CHANGED");
          }

          const enrolled = input.status === "ENROLLED";
          if (
            enrolled &&
            (input.grade === null || input.classNo === null || input.number === null)
          ) {
            throw new EnrollmentError("INCOMPLETE_ENROLLED");
          }

          const change = {
            ...input,
            grade: enrolled ? input.grade : null,
            classNo: enrolled ? input.classNo : null,
            number: enrolled ? input.number : null,
            userId: before.userId,
          };
          const changed = FIELDS.filter((field) => before[field] !== change[field]);
          if (changed.length === 0) continue;

          const active = keepsAccountActive(input.status);
          if (before.userId === actor.id && !active) {
            throw new EnrollmentError("CANNOT_DEACTIVATE_SELF");
          }
          planned.push({ change, active, changed });
        }

        if (planned.length === 0) return 0;

        // 자리 충돌을 같은 스냅샷에서 검사한다. 번호 맞바꾸기는 유일 제약이
        // DEFERRABLE이 아니므로 배치에 양쪽이 있어도 반려한다.
        const targetOwner = new Map<string, string>();
        for (const { change } of planned) {
          const slot = enrolledSlot(change);
          if (!slot) continue;
          const key = `${slot.grade}-${slot.classNo}-${slot.number}`;
          const label = formatSlot(slot.grade, slot.classNo, slot.number);
          const duplicate = targetOwner.get(key);
          if (duplicate && duplicate !== change.studentProfileId) {
            const a = byId.get(duplicate)?.name ?? duplicate;
            const b = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
            throw new EnrollmentError(
              "ENROLLMENT_CONFLICT",
              `${label} 자리가 겹칩니다: ${a}, ${b}`,
            );
          }
          targetOwner.set(key, change.studentProfileId);

          const occupant = currentRows.find(
            (row) =>
              row.studentProfileId !== change.studentProfileId &&
              row.status === "ENROLLED" &&
              row.grade === slot.grade &&
              row.classNo === slot.classNo &&
              row.number === slot.number,
          );
          if (occupant) {
            const mover = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
            throw new EnrollmentError(
              "ENROLLMENT_CONFLICT",
              `${label} 자리가 겹칩니다: ${occupant.name}, ${mover}`,
            );
          }
        }

        const items: repo.PlannedEnrollment[] = planned.map(
          ({ change, active, changed }) => ({
            ...change,
            accountActive: active,
            statusChanged: changed.includes("status"),
          }),
        );
        await repo.applyAll(year, items, tx);

        // 업무 변경과 학생별 감사로그는 같이 커밋되거나 같이 롤백되어야 한다.
        // actorName을 넘겨 학생 수만큼의 이름 재조회를 없앤다.
        for (const { change, active, changed } of planned) {
          await recordAudit(
            {
              actorUserId: actor.id,
              actorName: actor.name,
              action: "enrollment:update",
              targetType: "StudentProfile",
              targetId: change.studentProfileId,
              // 바뀐 값이 아니라 바뀐 항목 이름만. batch로 같은 저장임을 묶는다.
              metadata: { changed, batch, year },
            },
            tx,
          );

          // 계정 상태가 실제로 뒤집힐 때만 한 줄 더 남긴다. targetId는 userId여야
          // 계정 상세의 활동 기록이 이 줄을 찾는다.
          const before = byId.get(change.studentProfileId);
          if (changed.includes("status") && before && before.accountActive !== active) {
            await recordAudit(
              {
                actorUserId: actor.id,
                actorName: actor.name,
                action: active ? "user:activate" : "user:deactivate",
                targetType: "User",
                targetId: change.userId,
              },
              tx,
            );
          }
        }

        return planned.length;
      },
      { timeout: 30_000, maxWait: 5_000, isolationLevel: "Serializable" },
    );
    return { saved };
  } catch (error) {
    if (error instanceof repo.NumberTakenError) {
      throw new EnrollmentError("NUMBER_TAKEN");
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    ) {
      throw new EnrollmentError("ENROLLMENT_CHANGED");
    }
    throw error;
  }
}
