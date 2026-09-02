import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
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

        for (const { change, active, changed } of planned) {
          await recordAudit(
            {
              actorUserId: actor.id,
              actorName: actor.name,
              action: "enrollment:update",
              targetType: "StudentProfile",
              targetId: change.studentProfileId,
              metadata: { changed, batch, year },
            },
            tx,
          );

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
    if (isSerializationConflict(error)) {
      const currentYear = await repo.findCurrentYear();
      throw new EnrollmentError(
        currentYear === expectedYear ? "ENROLLMENT_CHANGED" : "YEAR_MISMATCH",
      );
    }
    throw error;
  }
}
