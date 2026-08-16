import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import {
  addKindPoints,
  DEMERIT_THRESHOLDS,
  demeritLevel,
  emptyKindTotals,
  isYearScoped,
  withNetScore,
  type DemeritLevel,
  type MeritTrack,
  type NetTotals,
} from "@/core/authz/merit-track";
import {
  categoryDistribution,
  monthlyTotals,
  rollingMonths,
  schoolYearMonths,
  schoolYearRange,
  type CategorySlice,
  type MonthlyPoint,
} from "./merit.chart";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import { BULK_AWARD_LIMIT } from "./merit.schema";
import type {
  AwardInput,
  BulkAwardInput,
  CancelBatchInput,
  CancelInput,
} from "./merit.schema";

/**
 * 순점수 = 상점 + 상쇄점 − 벌점. 상쇄점은 벌점을 덜어내므로 순점수를 올린다.
 *
 * 계산은 core/authz/merit-track이 한다 — 반 명단·반별 요약·월별 추이도 같은
 * 헬퍼를 쓰므로 화면마다 다른 순점수가 뜰 수 없다.
 */
export type MeritTotals = NetTotals;

export type StudentMeritView = {
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  totals: MeritTotals;
  awards: Awaited<ReturnType<typeof repo.listAwards>>;
};

const EMPTY_TOTALS: MeritTotals = withNetScore(emptyKindTotals());

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

/**
 * groupBy 결과(종류별 한 줄)를 화면이 쓰는 모양으로 접는다.
 *
 * 접는 규칙 자체는 merit-track이 갖고 있다 — 여기서는 Prisma의 `_sum` 껍데기만
 * 벗긴다. 상쇄점이 자기 칸에 남는 이유도 그쪽에 적혀 있다.
 */
export function sumTotals(
  rows: { kind: string; _sum: { points: number | null } }[],
): MeritTotals {
  const totals = emptyKindTotals();
  for (const row of rows) {
    addKindPoints(totals, row.kind, row._sum.points ?? 0);
  }
  return withNetScore(totals);
}

/**
 * 발생일이 그 학년도 안이고 미래가 아닌지 본다.
 *
 * **이 검사는 그래프가 조용히 틀리는 것을 막는 장치다.** 부여는 언제나
 * `getCurrentYear()`의 학년도로 들어가는데, 월별 추이의 축은 그 학년도의 12칸
 * (3월~이듬해 2월)이고 `monthlyTotals`는 축 밖의 기록을 **말없이 버린다.**
 * 발생일을 아무 값이나 받으면 "부여했습니다"가 뜬 기록이 어느 화면에도
 * 안 나타나는 상태가 만들어진다 — 아무도 눈치채지 못하는 종류의 실패다.
 *
 * 미래 날짜는 학년도 창(2월 말까지)만으로는 못 거른다 — 8월에 다음 1월을
 * 골라도 창 안이다. 그래서 따로 본다. 있을 수 없는 기록이기도 하다.
 */
function assertOccurredOn(occurredOn: Date, year: number, now: Date): void {
  const { start, endExclusive } = schoolYearRange(year);
  if (occurredOn < start || occurredOn >= endExclusive) {
    throw new MeritError("OCCURRED_OUT_OF_YEAR");
  }
  if (occurredOn.getTime() > now.getTime()) {
    throw new MeritError("OCCURRED_IN_FUTURE");
  }
}

/**
 * 상벌점 부여.
 *
 * **학년도는 입력이 아니라 getCurrentYear()가 정한다.** 화면의 학년도 선택은
 * 조회 전용이며, 그 값이 여기로 흘러들면 지난 학년도를 들여다보던 관리자가
 * 새 벌점을 거기 꽂는 사고가 난다.
 *
 * **발생일은 입력이다.** 세션에서 유도할 수 없는 사실이라서다 — 금요일 일을
 * 월요일에 넣는 사람만 그 날짜를 안다. 대신 학년도 창 안인지 여기서 본다.
 *
 * 규정 값(track·kind·label·points)을 복사해 넣는다 — 나중에 규정을 고쳐도
 * 이미 준 기록은 안 흔들린다.
 */
export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
  /** 미래 판정의 기준 시각. 인자로 받아야 테스트가 오늘 날짜에 안 흔들린다. */
  now: Date = new Date(),
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
  assertOccurredOn(input.occurredOn, year, now);

  const { id } = await repo.createAward({
    studentProfileId: student.id,
    year,
    ruleId: rule.id,
    track: rule.track,
    kind: rule.kind,
    label: rule.label,
    points: rule.points,
    occurredOn: input.occurredOn,
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
      // 감사로그는 입력 시각(로그 자체의 createdAt)을 이미 들고 있다. 발생일은
      // 사람이 고른 값이라 따로 남겨야 "언제 일어난 일로 넣었나"를 되짚을 수 있다.
      occurredOn: input.occurredOn.toISOString(),
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

  // 사전 검사와 갱신 사이에 남이 먼저 취소했으면 0이 온다. 그때 감사로그까지
  // 남기면 "두 사람이 취소했다"는 거짓 기록이 생긴다.
  const cancelled = await repo.cancelAward(award.id, {
    userId: actor.id,
    name: actor.name,
    reason: input.reason,
  });
  if (cancelled === 0) throw new MeritError("ALREADY_CANCELLED");

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:cancel",
    targetType: "MeritAward",
    targetId: award.id,
    metadata: {
      studentProfileId: award.studentProfileId,
      // 로그 화면이 "누구의 무엇을 취소했나"를 보여주려면 이름이 있어야 한다.
      studentName: award.studentProfile.user.name,
      track: award.track,
      kind: award.kind,
      label: award.label,
      points: award.points,
      reason: input.reason,
    },
  });
}

/**
 * 묶음 통째로 취소. 잘못 고른 항목으로 30명에게 줬을 때 한 명씩 30번 되돌리지
 * 않게 한다 — 그 30번이 각각 다른 사유로 기록되면 나중에 읽을 수도 없다.
 *
 * 단건 취소와 같은 규칙을 따른다: 사유 필수, ACTIVE인 것만, 감사로그는 건별 1줄.
 * 그 사이 누가 몇 건을 먼저 취소했으면 그건 건드리지 않는다.
 */
export async function cancelBatch(
  actor: SessionUser,
  input: CancelBatchInput,
): Promise<{ count: number }> {
  await assertCan(actor, "merit:cancel");

  const awards = await repo.findBatch(input.batchId);
  if (awards.length === 0) throw new MeritError("BATCH_NOT_FOUND");

  // 조회와 갱신 사이에 남이 몇 건을 단건으로 취소할 수 있다. repo는 **실제로
  // 뒤집힌 것의 id만** 돌려주고, 감사로그는 그것들에만 남긴다 — 조회한 건수로
  // 남기면 남이 취소한 건까지 "내가 취소했다"로 기록된다. 단건 경로의
  // `cancelled === 0` 검사가 막는 것과 같은 거짓이며, 묶음에서는 그 거짓이
  // 전부가 아니라 몇 줄만 섞여 들어와 더 알아채기 어렵다.
  const cancelled = new Set(
    await repo.cancelAwards(
      awards.map((award) => award.id),
      { userId: actor.id, name: actor.name, reason: input.reason },
    ),
  );
  if (cancelled.size === 0) throw new MeritError("ALREADY_CANCELLED");

  await Promise.all(
    awards
      .filter((award) => cancelled.has(award.id))
      .map((award) =>
        recordAudit({
          actorUserId: actor.id,
          actorName: actor.name,
          action: "merit:cancel",
          targetType: "MeritAward",
          targetId: award.id,
          metadata: {
            studentProfileId: award.studentProfileId,
            // 묶음은 트랙·종류·점수·항목이 전부 같다 — 이름이 없으면 28줄이
            // 완전히 동일해져 누구 기록이 뒤집혔는지 로그만으로는 알 수 없다.
            studentName: award.studentProfile.user.name,
            track: award.track,
            kind: award.kind,
            label: award.label,
            points: award.points,
            reason: input.reason,
            batchId: input.batchId,
          },
        }),
      ),
  );

  return { count: cancelled.size };
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
 * 화면 머리글용 신원 — 누구의 화면인지 알려준다.
 *
 * 상세 화면에 이름이 없으면 탭을 두 개 열어 놓고 비교하다가 엉뚱한 학생에게
 * 벌점을 줘도 화면에 아무 반증이 없다. 합계 3칸은 그냥 숫자 세 개일 뿐이다.
 *
 * 학급은 **현재 학년도 기준**이다. 지난 학년도 기록을 보고 있어도 "지금 몇 반인가"가
 * 사람을 식별하는 정보이므로 그쪽이 맞다.
 */
export async function getStudentHeader(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCan(actor, "merit:read:any");
  return repo.findStudentHeader(studentProfileId, await getCurrentYear());
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

/**
 * 여러 명에게 한 번에 부여.
 *
 * 한 트랜잭션으로 넣고 같은 batchId를 공유한다. **감사로그는 학생 1명당 1줄**이다 —
 * 일괄이어도 "이 학생이 왜 벌점을 받았나"를 건별로 추적해야 한다.
 * (enrollment.service.saveEnrollments와 같은 원칙)
 *
 * 학생 확인을 전부 끝낸 뒤에 쓴다. 한 명이라도 없으면 아무것도 넣지 않는다.
 */
export async function bulkAwardMerit(
  actor: SessionUser,
  input: BulkAwardInput,
  /** 미래 판정의 기준 시각. 단건 부여와 같은 이유로 인자로 받는다. */
  now: Date = new Date(),
): Promise<{ count: number }> {
  await assertCan(actor, "merit:award");

  const rule = await repo.findRule(input.ruleId);
  if (!rule) throw new MeritError("RULE_NOT_FOUND");
  if (!rule.active) throw new MeritError("RULE_INACTIVE");

  // 화면에서 같은 학생이 두 번 넘어와도 한 번만 준다.
  const ids = [...new Set(input.studentProfileIds)];
  if (ids.length === 0) throw new MeritError("NO_STUDENTS");
  // zod가 이미 막지만 여기서도 센다. 이건 입력 형식이 아니라 "한 번에 이만큼까지"라는
  // 업무 규칙이고, 규칙은 서비스가 지켜야 서버 액션을 새로 만들 때 함께 딸려 온다.
  if (ids.length > BULK_AWARD_LIMIT) throw new MeritError("TOO_MANY_STUDENTS");

  // DB에 쓰기 전에 전부 확인한다 — 절반만 들어가는 상태를 만들지 않는다.
  // 한 번에 조회한다: 예전엔 학생 수만큼 순차 왕복(최대 100회)이었다.
  const found = await repo.findStudentProfilesByIds(ids);
  if (found.length !== ids.length) throw new MeritError("STUDENT_NOT_FOUND");

  // 넘어온 순서를 지킨다 — 감사로그를 이 순서로 남기므로 화면 선택 순서와 맞는다.
  const byId = new Map(found.map((s) => [s.id, s]));
  const students = ids.map((id) => byId.get(id)!);

  const year = await getCurrentYear();
  assertOccurredOn(input.occurredOn, year, now);

  const batchId = randomUUID();

  const created = await repo.createAwards(
    students.map((student) => ({
      studentProfileId: student.id,
      year,
      ruleId: rule.id,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      occurredOn: input.occurredOn,
      note: input.note,
      awardedByUserId: actor.id,
      awardedByName: actor.name,
      batchId,
    })),
  );

  // 커밋된 뒤에 기록한다. 감사 실패가 부여를 되돌리지는 않는다 (core/audit 규약).
  // 감사 기록은 서로 독립이라 함께 보낸다. 건별 1줄이라는 규칙은 그대로다.
  await Promise.all(
    created.map((row, index) => {
      const student = students[index];
      return recordAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        action: "merit:award",
        targetType: "MeritAward",
        targetId: row.id,
        metadata: {
          studentProfileId: student.id,
          studentName: student.user.name,
          year,
          track: rule.track,
          kind: rule.kind,
          label: rule.label,
          points: rule.points,
          occurredOn: input.occurredOn.toISOString(),
          batchId,
        },
      });
    }),
  );

  return { count: created.length };
}

/**
 * 반별 목록.
 *
 * **반은 그 학년도 기준, 합계는 트랙 규칙을 따른다.** 기숙사 탭에서도 "2026학년도
 * 2학년 3반"의 명단을 보되 각자의 합계는 입학부터 전체 누적이다 — 반 편성은
 * 학년도 개념이지만 기숙사 점수는 아니기 때문이다.
 */
export async function getClassRoster(
  actor: SessionUser,
  params: { grade: number; classNo: number; track: MeritTrack; year?: number },
) {
  await assertCan(actor, "merit:read:any");

  const year = params.year ?? (await getCurrentYear());

  return repo.listClassRoster({
    year,
    grade: params.grade,
    classNo: params.classNo,
    track: params.track,
    totalsYear: await scopeYear(params.track, params.year),
  });
}

/** 이름 또는 학생코드로 찾는다. 반·번호는 현재 학년도 기준으로 붙인다. */
export async function searchStudents(actor: SessionUser, query: string) {
  await assertCan(actor, "merit:read:any");

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const year = await getCurrentYear();
  const rows = await repo.searchStudents(trimmed, year);

  return rows.map((row) => {
    const enrollment = row.enrollments[0];
    return {
      studentProfileId: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      grade: enrollment?.schoolClass?.grade ?? null,
      classNo: enrollment?.schoolClass?.classNo ?? null,
      number: enrollment?.number ?? null,
    };
  });
}

/**
 * 이 학생에게 기록이 있는 학년도들 (내림차순). 교내 탭의 학년도 선택지에 쓴다.
 *
 * **이 함수 자체는 권한을 검사하지 않는다** — studentProfileId가 이미 이 요청
 * 안에서 검증된 자리에서만 부른다. 학부모 조회는 getChildMerit이 소유권을
 * 확인에 성공한 뒤에만, 학생 본인 조회는 아래 listMyAwardYears가 세션에서
 * 유도한 id만 넘긴다 — 둘 다 URL의 studentProfileId를 그대로 받지 않는다.
 */
export async function listAwardYears(studentProfileId: string): Promise<number[]> {
  return repo.listAwardYears(studentProfileId);
}

/** 본인 조회. studentProfileId를 인자로 받지 않는다 — getMyMerit과 같은 이유. */
export async function listMyAwardYears(sessionUser: SessionUser): Promise<number[]> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listAwardYears(profile.id);
}

/** 로그인한 학부모의 자녀들. 화면의 자녀 선택에 쓴다. */
export async function listMyChildren(sessionUser: SessionUser) {
  const links = await repo.listChildren(sessionUser.id);
  return links.map((link) => ({
    studentProfileId: link.student.id,
    name: link.student.user.name,
  }));
}

/**
 * 학부모의 자녀 조회.
 *
 * `can()`으로 가를 수 없는 거부다 — 학부모 역할이 있다는 것과 **이** 학생의
 * 학부모라는 것은 다른 문제다. 연결을 직접 확인하고 ForbiddenError를 던지되,
 * 거부 감사로그는 assertCan과 같은 방식으로 남긴다
 * (invite.service.ts의 revokeInvite와 같은 처리).
 */
export async function getChildMerit(
  sessionUser: SessionUser,
  childProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const linked = await repo.isChildOf(sessionUser.id, childProfileId);

  if (!linked) {
    try {
      await recordAudit({
        actorUserId: sessionUser.id,
        actorName: sessionUser.name,
        action: "authz:denied",
        targetType: "MeritAward",
        metadata: { action: "merit:read:child", studentProfileId: childProfileId },
      });
    } catch {
      // 감사 기록 실패가 거부 자체를 막지 않는다.
    }
    throw new ForbiddenError("merit:read:child");
  }

  return readMerit(childProfileId, track, year);
}

// ── 통계 ──────────────────────────────────────────────────────

export type MeritStats = {
  /** 월별 추이 축 설명 — 교내는 학년도(3월~2월), 기숙사는 최근 12개월. */
  axisLabel: string;
  /**
   * 그래프(monthly·categories)가 덮는 기간을 짧게 적은 것.
   *
   * **머리글 합계(totals)·많이 나온 항목(topRules)의 범위와 다를 수 있다.**
   * 기숙사는 합계가 입학부터 누적인데 그래프만 최근 12개월로 자르기 때문이다.
   * 그래서 이 값을 화면이 그래프 옆에 적는다 — 안 적으면 "분류별 분포"의 합이
   * 머리글 상점·벌점보다 작은 이유가 화면 어디에도 나오지 않는다.
   */
  chartRange: string;
  monthly: MonthlyPoint[];
  categories: CategorySlice[];
  /** 반을 골랐으면 그 반. 안 골랐으면 null(전교). */
  scope: { grade: number; classNo: number } | null;
  /** 반을 골랐을 때만 채워진다 — 학생별 막대를 그린다. */
  students: Awaited<ReturnType<typeof repo.listClassRoster>> | null;
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  /** 반 편성 기준 학년도. 기숙사여도 반은 어느 해 기준인지가 필요하다. */
  rosterYear: number;
  totals: MeritTotals & { awardCount: number };
  classes: Awaited<ReturnType<typeof repo.classSummaries>>;
  topRules: Awaited<ReturnType<typeof repo.topRules>>;
  /** 벌점이 기준(warn) 이상인 학생들 — 벌점 많은 순. 표시 전용이다. */
  watchList: WatchListRow[];
  /** 화면에 그대로 적는다 — 학교가 정할 임시값이라 틀리면 바로 보여야 한다. */
  thresholds: { warn: number; danger: number };
};

/**
 * 기준 초과 명단의 한 줄. 소속이 없을 수 있다 (반 미배정·학적 변동 중) —
 * 그래도 명단에는 오른다.
 */
export type WatchListRow = {
  studentProfileId: string;
  name: string;
  studentCode: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  demerit: number;
  level: DemeritLevel;
};

/**
 * 벌점이 기준(warn) 이상인 학생들 — 벌점 많은 순.
 *
 * **이 목록이 없으면 "전교에서 선을 넘은 사람이 누구인가"에 답하려고 반 명단을
 * 하나씩 열어야 한다.** 선도위원회 준비가 매번 하는 일이 그것이다.
 *
 * **표시만 한다.** 기준을 넘겨도 회부·통보·상태 변경 같은 것은 하나도 일어나지
 * 않는다 — 설계서가 알림·자동 조치를 의도적으로 미뤘고, 불이익을 주는 판단은
 * 사람이 한다. 화면에 기준 숫자를 함께 내보내는 이유도 같다: DEMERIT_THRESHOLDS는
 * 학교가 정할 값의 임시값이라, 틀린 값이면 화면에서 바로 보여야 한다.
 */
async function readWatchList(
  track: MeritTrack,
  totalsYear: number | null,
  rosterYear: number,
  studentProfileIds?: string[],
): Promise<WatchListRow[]> {
  const { warn } = DEMERIT_THRESHOLDS[track];

  const sums = await repo.demeritTotalsByStudent({
    track,
    totalsYear,
    studentProfileIds,
  });

  // 기준 미만은 여기서 걸러 낸다 — 전교 300명 규모라 애플리케이션 필터로 충분하고,
  // "기준"이라는 업무 규칙이 서비스에 남는다.
  const over = sums
    .map((row) => ({ id: row.studentProfileId, demerit: row._sum.points ?? 0 }))
    .filter((row) => row.demerit >= warn);
  if (over.length === 0) return [];

  const students = await repo.findStudentsWithClass(
    over.map((row) => row.id),
    rosterYear,
  );
  const byId = new Map(students.map((s) => [s.id, s]));

  return over
    .flatMap((row) => {
      const student = byId.get(row.id);
      // 합계는 있는데 신원이 없으면(그 사이 지워진 계정) 줄을 만들지 않는다 —
      // 이름 없는 줄은 명단으로서 쓸모가 없다.
      if (!student) return [];

      const enrollment = student.enrollments[0];
      return [
        {
          studentProfileId: student.id,
          name: student.user.name,
          studentCode: student.studentCode,
          grade: enrollment?.schoolClass?.grade ?? null,
          classNo: enrollment?.schoolClass?.classNo ?? null,
          number: enrollment?.number ?? null,
          demerit: row.demerit,
          level: demeritLevel(track, row.demerit),
        },
      ];
    })
    .sort((a, b) => b.demerit - a.demerit || a.name.localeCompare(b.name, "ko"));
}

export type MeritSummary = {
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  totals: MeritTotals & { awardCount: number };
};

/**
 * 대시보드용 가벼운 요약 — 머리글 숫자만.
 *
 * getMeritStats를 쓰지 않는 이유: 그쪽은 월별 추이를 그리려고 해당 범위의 부여
 * 기록을 **전부** 읽어 오고(listAwardsForChart) 반별 집계까지 낸다. 대시보드는
 * 트랙 두 개를 나란히 보여주므로 그 무거운 일을 두 번 하게 되는데, 정작 쓰는
 * 값은 합계와 건수뿐이다. "대시보드에 통계 화면을 다시 만들지 않는다"는 원칙
 * (app/(app)/page.tsx 머리 주석)이 질의 비용에서도 그대로 성립하게 한다.
 */
export async function getMeritSummary(
  actor: SessionUser,
  track: MeritTrack,
): Promise<MeritSummary> {
  await assertCan(actor, "merit:read:any");

  const scoped = await scopeYear(track);
  const rows = await repo.trackTotals({ track, totalsYear: scoped });

  return {
    track,
    year: scoped,
    totals: {
      ...sumTotals(rows),
      awardCount: rows.reduce((sum, row) => sum + row._count._all, 0),
    },
  };
}

/** 순위 표시는 관리자 화면에만 둔다 — 학생에게 등수를 띄우는 건 별개 결정이다. */
const TOP_RULE_LIMIT = 10;

export async function getMeritStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
  /** 최근 12개월 축의 기준 시각. 인자로 받아야 테스트가 날짜에 안 흔들린다. */
  now: Date = new Date(),
  /** 주면 그 반만 본다 — 담임이 자기 반만 보는 화면. */
  scope?: { grade: number; classNo: number },
): Promise<MeritStats> {
  await assertCan(actor, "merit:read:any");

  // 합계 범위는 트랙 규칙(교내=학년도, 기숙사=누적)을 따르고, 반 편성은 언제나
  // 어느 학년도의 것인지가 필요하다 — 기숙사가 누적이어도 "지금 2학년 3반"은
  // 학년도 개념이기 때문이다.
  const scoped = await scopeYear(track, year);
  const rosterYear = year ?? (await getCurrentYear());

  // 기숙사는 누적이라 학년도 경계가 없다 — 최근 12개월만 그린다. 그렇지 않으면
  // 3학년 학생이 있는 해에는 축이 3년치로 늘어나 아무것도 안 보인다.
  const axis = isYearScoped(track)
    ? schoolYearMonths(scoped ?? rosterYear)
    : rollingMonths(now);
  //
  // **since는 그래프 조회에만 넘긴다.** 합계(trackTotals)와 많이 나온
  // 항목(topRules)은 기숙사에서도 누적 그대로 둔다 — 학생 화면·학부모 화면·
  // 확인서가 모두 누적을 보여주므로 통계 화면만 12개월로 자르면 같은 학생의
  // 숫자가 화면마다 달라진다. 트랙 정의("기숙사는 입학부터 누적")가 이기는 게
  // 맞고, 대신 그래프가 덮는 기간을 chartRange로 내보내 화면에 적는다.
  const since = isYearScoped(track) ? undefined : monthStart(axis[0].key);

  // 반을 골랐으면 그 반 학생만 대상으로 삼는다. 학생 목록을 먼저 뽑아야
  // 나머지 질의에 넘길 수 있어서 이 조회만 앞선다.
  const classRoster = scope
    ? await repo.listClassRoster({
        year: rosterYear,
        grade: scope.grade,
        classNo: scope.classNo,
        track,
        totalsYear: scoped,
      })
    : null;
  const studentProfileIds = classRoster?.map((r) => r.studentProfileId);

  // 반에 학생이 하나도 없으면 빈 배열이 되는데, 그대로 넘기면 Prisma의
  // `in: []`가 "아무것도 없음"으로 동작해 의도대로 빈 결과가 나온다.
  const [totalRows, classes, topRules, chartAwards, watchList] = await Promise.all([
    repo.trackTotals({ track, totalsYear: scoped, studentProfileIds }),
    repo.classSummaries({ year: rosterYear, track, totalsYear: scoped }),
    repo.topRules({
      track,
      totalsYear: scoped,
      limit: TOP_RULE_LIMIT,
      studentProfileIds,
    }),
    repo.listAwardsForChart({ track, year: scoped, since, studentProfileIds }),
    // 반을 골랐으면 그 반 안에서만 본다 — 화면의 다른 숫자와 범위를 맞춘다.
    readWatchList(track, scoped, rosterYear, studentProfileIds),
  ]);

  const totals = sumTotals(totalRows);
  const awardCount = totalRows.reduce((sum, row) => sum + row._count._all, 0);

  return {
    track,
    year: scoped,
    rosterYear,
    scope: scope ?? null,
    students: classRoster,
    // 반을 골랐으면 그 반만 표에 남긴다 — 다른 반이 함께 보이면 무엇을 보고
    // 있는지가 흐려진다.
    axisLabel: isYearScoped(track)
      ? `${scoped ?? rosterYear}학년도 (3월~이듬해 2월)`
      : "최근 12개월 (누적)",
    chartRange: isYearScoped(track) ? `${scoped ?? rosterYear}학년도` : "최근 12개월",
    monthly: monthlyTotals(chartAwards, axis),
    categories: categoryDistribution(chartAwards),
    totals: { ...totals, awardCount },
    classes: scope
      ? classes.filter((c) => c.grade === scope.grade && c.classNo === scope.classNo)
      : classes,
    topRules,
    watchList,
    thresholds: DEMERIT_THRESHOLDS[track],
  };
}

/** `2026-03` → 그 달 1일 00:00 KST. 조회 하한으로 쓴다. */
function monthStart(key: string): Date {
  const [year, month] = key.split("-");
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}

/**
 * 최근 부여 흐름. "오늘 무슨 일이 있었나"를 훑는 용도라 취소된 것도 보여준다 —
 * 취소 역시 일어난 일이고, 빠지면 목록이 조용히 짧아져 더 헷갈린다.
 */
export async function listRecentAwards(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:read:any");
  return repo.listRecentAwards({ track, limit: RECENT_AWARD_LIMIT });
}

const RECENT_AWARD_LIMIT = 30;
