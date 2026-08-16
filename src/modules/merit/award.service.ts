import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import type { AwardInput, CancelInput } from "./merit.schema";

export type MeritTotals = { merit: number; demerit: number; net: number };

export type StudentMeritView = {
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  totals: MeritTotals;
  awards: Awaited<ReturnType<typeof repo.listAwards>>;
};

const EMPTY_TOTALS: MeritTotals = { merit: 0, demerit: 0, net: 0 };

/**
 * 합계를 셀 학년도를 정한다. **이 함수 하나가 "교내는 매년 초기화, 기숙사는 누적"의
 * 구현 전부다.** null이면 repo가 학년도 조건을 붙이지 않는다.
 *
 * 기숙사는 넘어온 year를 무시한다 — 누적이라 고를 것이 없고, 화면에도 선택이 없다.
 */
async function scopeYear(
  track: MeritTrack,
  year?: number,
): Promise<number | null> {
  if (!isYearScoped(track)) return null;
  return year ?? (await getCurrentYear());
}

function sumTotals(
  rows: { kind: string; _sum: { points: number | null } }[],
): MeritTotals {
  let merit = 0;
  let demerit = 0;
  for (const row of rows) {
    const points = row._sum.points ?? 0;
    if (row.kind === "MERIT") merit += points;
    else if (row.kind === "DEMERIT") demerit += points;
  }
  return { merit, demerit, net: merit - demerit };
}

/**
 * 상벌점 부여.
 *
 * **학년도는 입력이 아니라 getCurrentYear()가 정한다.** 화면의 학년도 선택은
 * 조회 전용이며, 그 값이 여기로 흘러들면 지난 학년도를 들여다보던 관리자가
 * 새 벌점을 거기 꽂는 사고가 난다.
 *
 * 규정 값(track·kind·label·points)을 복사해 넣는다 — 나중에 규정을 고쳐도
 * 이미 준 기록은 안 흔들린다.
 */
export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
): Promise<void> {
  await assertCan(actor, "merit:award");

  const rule = await repo.findRule(input.ruleId);
  if (!rule) throw new MeritError("RULE_NOT_FOUND");
  if (!rule.active) throw new MeritError("RULE_INACTIVE");

  // 화면(반별 목록·검색)은 소프트 삭제된 학생을 내놓지 않지만, 서버 액션을
  // 직접 부르면 아무 id나 보낼 수 있다. repo가 deletedAt까지 보고 거른다.
  const student = await repo.findStudentProfileById(input.studentProfileId);
  if (!student) throw new MeritError("STUDENT_NOT_FOUND");

  const year = await getCurrentYear();

  const { id } = await repo.createAward({
    studentProfileId: student.id,
    year,
    ruleId: rule.id,
    track: rule.track,
    kind: rule.kind,
    label: rule.label,
    points: rule.points,
    note: input.note,
    awardedByUserId: actor.id,
    awardedByName: actor.name,
    batchId: null,
  });

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:award",
    targetType: "MeritAward",
    targetId: id,
    metadata: {
      studentProfileId: student.id,
      studentName: student.user.name,
      year,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
    },
  });
}

/**
 * 취소. **관리자면 누구나 할 수 있다** — 교직원 사이에 권한 차등이 없으므로
 * "자기가 준 것만"은 근거가 없고, 준 사람이 출장·퇴직이면 아무도 못 고치게 된다.
 * 책임 추적은 필수 사유(zod) + 이름 스냅샷 + 감사로그가 맡는다.
 *
 * 기록은 지우지 않는다 — 취소 표시가 붙은 채로 목록에 남고 합계에서만 빠진다.
 */
export async function cancelAward(
  actor: SessionUser,
  input: CancelInput,
): Promise<void> {
  await assertCan(actor, "merit:cancel");

  const award = await repo.findAward(input.awardId);
  if (!award) throw new MeritError("AWARD_NOT_FOUND");
  if (award.status !== "ACTIVE") throw new MeritError("ALREADY_CANCELLED");

  await repo.cancelAward(award.id, {
    userId: actor.id,
    name: actor.name,
    reason: input.reason,
  });

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:cancel",
    targetType: "MeritAward",
    targetId: award.id,
    metadata: {
      studentProfileId: award.studentProfileId,
      track: award.track,
      kind: award.kind,
      label: award.label,
      points: award.points,
      reason: input.reason,
    },
  });
}

/** 관리자가 보는 한 학생의 트랙별 현황. */
export async function getStudentMerit(
  actor: SessionUser,
  studentProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertCan(actor, "merit:read:any");
  return readMerit(studentProfileId, track, year);
}

/**
 * 본인 조회. **studentProfileId를 인자로 받지 않는다** — 세션에서 유도한다.
 * URL 파라미터를 바꿔 남의 기록을 보는 경로가 존재하지 않는다.
 *
 * 학생 신원이 없으면(관리자·학부모가 이 함수를 타는 경우) 빈 결과를 준다.
 * 화면이 터지는 것보다 "기록 없음"이 맞는 표현이다.
 */
export async function getMyMerit(
  sessionUser: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) {
    return { track, year: await scopeYear(track, year), totals: EMPTY_TOTALS, awards: [] };
  }
  return readMerit(profile.id, track, year);
}

/** 권한 검사를 끝낸 뒤의 공통 조회. 외부로 내보내지 않는다. */
async function readMerit(
  studentProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const scoped = await scopeYear(track, year);

  const [rows, awards] = await Promise.all([
    repo.totals({ studentProfileId, track, year: scoped }),
    repo.listAwards({ studentProfileId, track, year: scoped }),
  ]);

  return { track, year: scoped, totals: sumTotals(rows), awards };
}
