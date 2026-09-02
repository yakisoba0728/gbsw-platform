import { cache } from "react";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { MAX_YEAR, MIN_YEAR } from "./academic-year.schema";
import * as repo from "./academic-year.repo";

export class AcademicYearError extends Error {}

export const getCurrentYear = cache(async (): Promise<number> => {
  const current = await repo.findCurrent();
  if (!current) throw new AcademicYearError("NO_CURRENT_YEAR");
  return current.year;
});

export async function listYears(actor: SessionUser) {
  await assertCan(actor, "academic-year:manage");
  return repo.listYears();
}

export async function createYear(actor: SessionUser, year: number): Promise<void> {
  await assertCan(actor, "academic-year:manage");

  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new AcademicYearError("INVALID_YEAR");
  }

  try {
    await withTransaction(async (tx) => {
      await repo.createYear(year, tx);

      await recordAudit({
        actorUserId: actor.id,
        action: "academic-year:create",
        targetType: "AcademicYear",
        targetId: String(year),
      }, tx);
    });
  } catch (error) {
    if (error instanceof repo.YearTakenError) {
      throw new AcademicYearError("YEAR_TAKEN");
    }
    throw error;
  }

}

export async function setCurrentYear(
  actor: SessionUser,
  year: number,
): Promise<void> {
  await assertCan(actor, "academic-year:manage");

  await withTransaction(async (tx) => {
    const result = await repo.setCurrent(year, tx);
    if (!result.changed) return;

    await recordAudit({
      actorUserId: actor.id,
      action: "academic-year:set-current",
      targetType: "AcademicYear",
      targetId: String(year),
      metadata: { from: result.previousYear },
    }, tx);
  });
}
