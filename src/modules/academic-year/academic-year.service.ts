import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import * as repo from "./academic-year.repo";

export class AcademicYearError extends Error {}

/** 학교가 실제로 존재할 수 있는 범위. 오타로 20226을 넣는 걸 막는다. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

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
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");
  return repo.listYears();
}

export async function createYear(actor: SessionUser, year: number): Promise<void> {
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new AcademicYearError("INVALID_YEAR");
  }

  await repo.createYear(year);

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
  if (!can(actor, "academic-year:manage")) throw new Error("FORBIDDEN");

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
