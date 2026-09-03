import { randomUUID } from "node:crypto";
import { recordAuditMany } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { keepsAccountActive } from "@/core/authz/enrollment-status";
import { can, type Action } from "@/core/authz/can";
import { assertCan, denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { isSerializationConflict } from "@/core/db/transaction-conflict";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./enrollment.repo";
import type { EnrollmentChange } from "./enrollment.schema";

export class EnrollmentError extends Error {
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

const STUDENT_VIEW_ACTIONS: Action[] = [
  "merit:read:any",
  "pass:read:any",
  "student:manage",
];

async function assertCanViewStudent(actor: SessionUser): Promise<void> {
  if (STUDENT_VIEW_ACTIONS.some((action) => can(actor, action))) return;

  await denyAccess(actor, "student:view", {
    actorName: actor.name,
    targetType: "StudentProfile",
  });
}

export async function getStudentIdentity(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCanViewStudent(actor);

  const detail = await repo.findStudentDetail(
    studentProfileId,
    await getCurrentYear(),
  );
  if (!detail) return null;

  return {
    studentProfileId: detail.studentProfileId,
    studentCode: detail.studentCode,
    name: detail.name,
    role: detail.role,
    grade: detail.grade,
    classNo: detail.classNo,
    number: detail.number,
    status: detail.status,
    removed: detail.removed,
  };
}

export async function getStudentProfile(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCan(actor, "student:manage");
  return repo.findStudentDetail(studentProfileId, await getCurrentYear());
}

const FIELDS = ["grade", "classNo", "number", "status"] as const;

function formatSlot(grade: number, classNo: number, number: number): string {
  return `${grade}학년 ${classNo}반 ${number}번`;
}

function enrolledSlot(
  change: EnrollmentChange,
): { grade: number; classNo: number; number: number } | null {
  if (change.status !== "ENROLLED") return null;
  if (change.grade === null || change.classNo === null || change.number === null) {
    return null;
  }
  return { grade: change.grade, classNo: change.classNo, number: change.number };
}

export async function saveEnrollments(
  actor: SessionUser,
  changes: EnrollmentChange[],
  expectedYear: number,
): Promise<{ saved: number }> {
  await assertCan(actor, "student:manage");

  const deduped = [...new Map(changes.map((c) => [c.studentProfileId, c])).values()];
  const batch = randomUUID();

  try {
    const saved = await withTransaction(
      async (tx) => {
        const year = await repo.findCurrentYearForUpdate(tx);
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

        // 저장 "후"의 최종 자리 배치를 기준으로 충돌을 판정한다. 적용 "전"의 현재
        // 상태만 보면, 같은 배치에서 비켜나는 학생이 있는 자리로의 이동과 자리
        // 교환(A↔B)까지 겹침으로 잘못 반려된다(명단 반영 경로와 달리 수동 저장만
        // 막히던 문제). repo.applyAll이 배치 학생들의 자리를 먼저 비웠다가 최종
        // 값을 쓰므로, 여기서 최종 상태가 겹치지 않으면 유일 제약도 통과한다.
        const plannedIds = new Set(planned.map(({ change }) => change.studentProfileId));
        const finalOwner = new Map<string, string>();
        for (const row of currentRows) {
          // 배치에 든 학생의 옛 자리는 비켜나는 것으로 보고 비워 둔다.
          if (plannedIds.has(row.studentProfileId)) continue;
          if (
            row.status !== "ENROLLED" ||
            row.grade === null ||
            row.classNo === null ||
            row.number === null
          ) {
            continue;
          }
          finalOwner.set(`${row.grade}-${row.classNo}-${row.number}`, row.studentProfileId);
        }
        for (const { change } of planned) {
          const slot = enrolledSlot(change);
          if (!slot) continue;
          const key = `${slot.grade}-${slot.classNo}-${slot.number}`;
          const label = formatSlot(slot.grade, slot.classNo, slot.number);
          const owner = finalOwner.get(key);
          if (owner && owner !== change.studentProfileId) {
            const a = byId.get(owner)?.name ?? owner;
            const b = byId.get(change.studentProfileId)?.name ?? change.studentProfileId;
            throw new EnrollmentError(
              "ENROLLMENT_CONFLICT",
              `${label} 자리가 겹칩니다: ${a}, ${b}`,
            );
          }
          finalOwner.set(key, change.studentProfileId);
        }

        // 소프트삭제(deletedAt)된 학생의 잔존 학적 행은 listByYear 어느 화면에도
        // 노출되지 않지만 (year, grade, classNo, number) 유니크 인덱스는 그 자리를
        // 계속 점유한다. 이 자리에 배정할 때는 트랜잭션 안에서 잔존 행을 지워
        // NUMBER_TAKEN 대신 저장이 성공하도록 한다. 정책 근거는 repo 쪽 주석 참고.
        const targetSeats = new Map<string, { grade: number; classNo: number; number: number }>();
        for (const { change } of planned) {
          const slot = enrolledSlot(change);
          if (slot) targetSeats.set(`${slot.grade}-${slot.classNo}-${slot.number}`, slot);
        }
        if (targetSeats.size > 0) {
          await repo.deleteEnrollmentsOfRemovedStudents(
            year,
            [...targetSeats.values()],
            tx,
          );
        }

        const items: repo.PlannedEnrollment[] = planned.map(
          ({ change, active, changed }) => ({
            ...change,
            accountActive: active,
            statusChanged: changed.includes("status"),
          }),
        );
        await repo.applyAll(year, items, tx);

        // 학생마다 감사 쿼리를 치지 않고 한 번에 기록한다. 저장과 같은 tx라
        // 감사 실패도 함께 롤백된다.
        const auditEntries: Parameters<typeof recordAuditMany>[0] = [];
        for (const { change, active, changed } of planned) {
          auditEntries.push({
            actorUserId: actor.id,
            actorName: actor.name,
            action: "enrollment:update",
            targetType: "StudentProfile",
            targetId: change.studentProfileId,
            metadata: { changed, batch, year },
          });

          const before = byId.get(change.studentProfileId);
          if (changed.includes("status") && before && before.accountActive !== active) {
            auditEntries.push({
              actorUserId: actor.id,
              actorName: actor.name,
              action: active ? "user:activate" : "user:deactivate",
              targetType: "User",
              targetId: change.userId,
            });
          }
        }

        await recordAuditMany(auditEntries, tx);

        return planned.length;
      },
      { timeout: 30_000, maxWait: 5_000, isolationLevel: "Serializable" },
    );
    return { saved };
  } catch (error) {
    if (error instanceof repo.NumberTakenError) {
      throw new EnrollmentError("NUMBER_TAKEN");
    }
    if (isSerializationConflict(error)) {
      const currentYear = await repo.findCurrentYear();
      throw new EnrollmentError(
        currentYear === expectedYear ? "ENROLLMENT_CHANGED" : "YEAR_MISMATCH",
      );
    }
    throw error;
  }
}
