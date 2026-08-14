import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { MAX_YEAR, MIN_YEAR } from "./academic-year.schema";
import * as repo from "./academic-year.repo";

export class AcademicYearError extends Error {}

/**
 * 현재 학년도.
 *
 * 없으면 던진다. null로 넘기면 소속 조회가 전부 빈 결과를 내면서
 * "학생이 아무 반에도 없다"처럼 보이는데, 원인이 화면에 드러나지 않는다.
 */
export async function getCurrentYear(): Promise<number> {
  const current = await repo.findCurrent();
  if (!current) throw new AcademicYearError("NO_CURRENT_YEAR");
  return current.year;
}

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
    await repo.createYear(year);
  } catch (error) {
    if (error instanceof repo.YearTakenError) {
      throw new AcademicYearError("YEAR_TAKEN");
    }
    throw error;
  }

  await recordAudit({
    actorUserId: actor.id,
    action: "academic-year:create",
    targetType: "AcademicYear",
    targetId: String(year),
  });
}

export async function setCurrentYear(
  actor: SessionUser,
  year: number,
): Promise<void> {
  await assertCan(actor, "academic-year:manage");

  // 이미 현재 학년도면 기록도 남기지 않는다 (no-op으로 감사로그가 오염되지 않게).
  const current = await repo.findCurrent();
  if (current?.year === year) return;

  await repo.setCurrent(year);

  await recordAudit({
    actorUserId: actor.id,
    action: "academic-year:set-current",
    targetType: "AcademicYear",
    targetId: String(year),
    metadata: { from: current?.year ?? null },
  });
}
