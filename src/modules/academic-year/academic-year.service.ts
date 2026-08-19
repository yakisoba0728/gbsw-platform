import { cache } from "react";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { MAX_YEAR, MIN_YEAR } from "./academic-year.schema";
import * as repo from "./academic-year.repo";

export class AcademicYearError extends Error {}

/**
 * 현재 학년도. 없으면 던진다 — null로 넘기면 소속 조회가 전부 비면서 원인이
 * 화면에 드러나지 않는다. 한 요청 안에서는 React cache가 한 번만 조회한다.
 */
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

  // 재검증이 아니라 업무 불변식이다 — 학년도는 만들면 지울 수 없어서, 폼을
  // 안 거치는 호출부가 생기면 오타 하나가 선택 목록에 영구히 남는다.
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
    // 직전 학년도 조회와 전환을 같은 잠금/트랜잭션에서 수행한다. 그래야 병렬
    // 전환이 끼어들어도 감사로그의 from이 실제 직전 값과 일치한다.
    const result = await repo.setCurrent(year, tx);
    // 이미 현재 학년도면 기록도 남기지 않는다 (no-op 감사로그 방지).
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
