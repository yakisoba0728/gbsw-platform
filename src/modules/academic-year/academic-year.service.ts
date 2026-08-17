import { cache } from "react";
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
 *
 * **한 요청 안에서는 한 번만 조회한다** (React cache). 상벌점 화면 하나가
 * 이 함수를 3~5번 부른다 — 합계 범위 계산, 학생 머리글, 과거 학년도 판정이
 * 각자 부른다. 같은 요청 안에서 값이 바뀔 일이 없으므로 왕복을 줄인다.
 * 요청이 끝나면 캐시도 사라져서 학년도를 바꾼 직후 화면이 옛 값을 보지 않는다.
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

  /*
   * 범위는 경계(yearFormSchema)가 이미 봤다. 여기서 한 번 더 보는 것은
   * **재검증이 아니라 업무 불변식**이다 — 학년도는 만들고 나면 지울 수 없고
   * (SchoolClass·Enrollment·MeritAward가 전부 이 값을 참조한다), 오타 하나로
   * 들어간 20260년은 학년도 선택 목록에 영구히 남는다. 폼을 안 거치는 호출부
   * (스크립트·미래의 API)가 생겨도 이 세 줄이 남아 있어야 그 사고가 안 난다.
   * threshold·award·roster·enrollment 서비스가 같은 이유로 같은 자리를 지킨다.
   */
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
