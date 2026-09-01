import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import {
  addKindPoints,
  emptyKindTotals,
  isYearScoped,
  MERIT_TRACK_LABELS,
  withNetScore,
  type MeritTrack,
  type NetTotals,
} from "@/core/authz/merit-track";
import { schoolYearRange } from "./merit.chart";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import { toHistorySheet, toRecentAwardsSheet, toRosterSheet } from "./merit.export";
import { kstDayStart } from "@/lib/datetime";
import { parseStudentNumber } from "@/lib/student-number";
import * as repo from "./merit.repo";
import { BULK_AWARD_LIMIT } from "./merit.schema";
import type {
  AwardInput,
  BulkAwardInput,
  CancelInput,
  ClassRosterExportInput,
  ClassRosterInput,
  RecentAwardFilter,
  RecentAwardsExportInput,
  RecentAwardsQuery,
  StudentHistoryExportInput,
} from "./merit.schema";
import { RECENT_AWARD_PAGE_SIZE } from "./merit.schema";

/**
 * 순점수 = 상점 + 상쇄점 − 벌점. 계산은 전부 core/authz/merit-track이 한다.
 * 기록은 Enrollment가 아니라 StudentProfile.id에 매단다 — 학년이 바뀌어도
 * 같은 사람의 기록으로 이어져야 한다.
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
 * 합계를 셀 학년도를 정한다 — 교내는 매년 초기화, 기숙사는 누적.
 * **null을 주면 repo가 학년도 필터를 통째로 뺀다.**
 */
export async function scopeYear(
  track: MeritTrack,
  year?: number,
): Promise<number | null> {
  if (!isYearScoped(track)) return null;
  return year ?? (await getCurrentYear());
}

/** groupBy 결과를 화면이 쓰는 모양으로 접는다. 접는 규칙은 merit-track이 갖고 있다. */
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
 * 발생일이 그 학년도 안이고 미래가 아닌지 본다. monthlyTotals가 축 밖의 기록을
 * 말없이 버리므로, 이 검사가 없으면 부여에 성공한 기록이 어느 화면에도 안 나타난다.
 *
 * 발생일이 이제 항상 오늘이라 미래 검사는 걸릴 일이 없지만, **학년도 창 검사는
 * 여전히 걸린다** — 현재 학년도를 넘기지 않은 채 3월을 맞으면 오늘이 지난
 * 학년도 창 밖이 된다. 그때 조용히 저장되면 그 기록은 어느 집계에도 안 잡힌다.
 *
 * 미래 검사는 지우지 않고 둔다. 발생일이 화면 입력이던 시절의 잔재가 아니라,
 * 「발생일은 부여 시각보다 뒤일 수 없다」는 불변식이다 — 다시 입력을 받는 날
 * 이 줄이 없으면 그 사실을 아무도 안 지킨다. 지금 그 줄이 닿지 않는다는 것은
 * `occurredOn`이 `now`에서 유도된다는 뜻이고, 그 유도를 테스트가 붙든다.
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
 * 상벌점 부여. 학년도는 입력이 아니라 getCurrentYear()가 정한다 — 화면의 학년도
 * 선택은 조회 전용이다. 발생일도 입력이 아니라 오늘(KST)이다.
 * 규정 값을 복사해 넣는다 — 나중에 규정을 고쳐도 이미 준 기록은 안 흔들린다.
 */
export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
  /** 미래 판정의 기준 시각. 인자로 받아야 테스트가 오늘 날짜에 안 흔들린다. */
  now: Date = new Date(),
): Promise<void> {
  await assertCan(actor, "merit:award");

  // 발생일은 입력이 아니라 오늘이다. 소급 입력 경로는 없앴다.
  const occurredOn = kstDayStart(now);

  await withTransaction(async (tx) => {
    const year = await repo.findCurrentYearForUpdate(tx);
    if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");
    assertOccurredOn(occurredOn, year, now);

    // 부여는 그 학년도에 재적 중인 학생에게만 한다 — 조회는 명단에서 빠진 학생도
    // 열려 있지만 부여는 아니다. **잠근 학년도를 넘겨 같은 트랜잭션 안에서 본다**:
    // 밖에서 검사하면 그 사이 학년도가 바뀌어, 작년 재적을 보고 올해에 저장한다.
    const student = await repo.findAwardableStudent(input.studentProfileId, year, tx);
    if (!student) throw new MeritError("STUDENT_NOT_FOUND");

    const rule = await repo.findRuleForUpdate(input.ruleId, tx);
    if (!rule) throw new MeritError("RULE_NOT_FOUND");
    if (!rule.active) throw new MeritError("RULE_INACTIVE");

    const { id } = await repo.createAward({
      studentProfileId: student.id,
      year,
      ruleId: rule.id,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      occurredOn,
      note: input.note,
      awardedByUserId: actor.id,
      awardedByName: actor.name,
    }, tx);

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
        // 로그의 createdAt은 입력 시각이다 — 사람이 고른 발생일은 따로 남긴다.
        occurredOn: occurredOn.toISOString(),
      },
    }, tx);
  },
  // bulkAwardMerit과 같은 예산을 준다. 이 트랜잭션은 findCurrentYearForUpdate로
  // AcademicYear를 잠그는데, 명단 일괄 반영이 같은 잠금을 최대 120초 쥔다
  // (roster.service의 timeout). 기본값 5초로는 학년 초 명단 반영 중에 부여가
  // P2028로 떨어지고, 화면에는 원인을 알 수 없는 문구만 나간다.
  { timeout: 30_000, maxWait: 5_000 },
  );
}

/**
 * 취소. 교사면 누구나 할 수 있다 — 교직원 사이에 권한 차등이 없다. 책임 추적은
 * 필수 사유 + 이름 스냅샷 + 감사로그가 맡는다. 기록은 지우지 않고 합계에서만 빠진다.
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
  await withTransaction(async (tx) => {
    const cancelled = await repo.cancelAward(award.id, {
      userId: actor.id,
      name: actor.name,
      reason: input.reason,
    }, tx);
    if (cancelled === 0) throw new MeritError("ALREADY_CANCELLED");

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:cancel",
      targetType: "MeritAward",
      targetId: award.id,
      metadata: {
        studentProfileId: award.studentProfileId,
        // 로그가 "누구의 무엇을 취소했나"에 답하려면 이름이 있어야 한다.
        studentName: award.studentProfile.user.name,
        track: award.track,
        kind: award.kind,
        label: award.label,
        points: award.points,
        reason: input.reason,
      },
    }, tx);
  });
}

/** 교사가 보는 한 학생의 트랙별 현황. */
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
 * 화면 머리글용 신원. 학급은 현재 학년도 기준이다 — 지난 기록을 보고 있어도
 * 사람을 식별하는 것은 "지금 몇 반인가"다. 명단에서 빠진 학생도 돌려주고
 * (`removed`가 그 사실을, `status`가 학적을 싣는다) 화면이 부여를 닫는다.
 */
export async function getStudentHeader(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCan(actor, "merit:read:any");
  return repo.findStudentHeader(studentProfileId, await getCurrentYear());
}

/**
 * 본인 조회. studentProfileId를 인자로 받지 않는다 — 세션에서 유도하므로 URL을
 * 바꿔 남의 기록을 보는 경로가 없다. 학생 신원이 없으면 빈 결과를 준다.
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
 * 여러 명에게 한 번에 부여. 한 트랜잭션으로 넣되 기록은 서로 독립이다 —
 * 감사로그는 학생 1명당 1줄이다. 한 명이라도 없으면 아무것도 넣지 않는다.
 */
export async function bulkAwardMerit(
  actor: SessionUser,
  input: BulkAwardInput,
  /** 미래 판정의 기준 시각. 단건 부여와 같은 이유로 인자로 받는다. */
  now: Date = new Date(),
): Promise<{ count: number }> {
  await assertCan(actor, "merit:award");

  // 화면에서 같은 학생이 두 번 넘어와도 한 번만 준다.
  const ids = [...new Set(input.studentProfileIds)];
  if (ids.length === 0) throw new MeritError("NO_STUDENTS");
  // zod가 이미 막지만 업무 규칙이라 서비스에서도 센다.
  if (ids.length > BULK_AWARD_LIMIT) throw new MeritError("TOO_MANY_STUDENTS");

  const occurredOn = kstDayStart(now);

  const created = await withTransaction(
    async (tx) => {
      const year = await repo.findCurrentYearForUpdate(tx);
      if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");
      assertOccurredOn(occurredOn, year, now);

      // 쓰기 전에 전부 확인한다 — 한 명이라도 그 학년도 재적이 아니면 아무도 받지
      // 않는다. 단건 부여와 같은 이유로 잠근 학년도를 같은 트랜잭션에서 본다.
      const found = await repo.findAwardableStudents(ids, year, tx);
      if (found.length !== ids.length) throw new MeritError("STUDENT_NOT_FOUND");

      // 넘어온 순서를 지킨다 — 감사로그를 이 순서로 남기므로 화면 선택 순서와 맞는다.
      const byId = new Map(found.map((s) => [s.id, s]));
      const students = ids.map((id) => byId.get(id)!);

      const rule = await repo.findRuleForUpdate(input.ruleId, tx);
      if (!rule) throw new MeritError("RULE_NOT_FOUND");
      if (!rule.active) throw new MeritError("RULE_INACTIVE");

      const items = students.map((student) => ({
        studentProfileId: student.id,
        year,
        ruleId: rule.id,
        track: rule.track,
        kind: rule.kind,
        label: rule.label,
        points: rule.points,
        occurredOn,
        note: input.note,
        awardedByUserId: actor.id,
        awardedByName: actor.name,
      }));

      const rows = await repo.createAwards(items, tx);
      for (const [index, row] of rows.entries()) {
        const student = students[index];
        await recordAudit({
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
            occurredOn: occurredOn.toISOString(),
          },
        }, tx);
      }
      return rows;
    },
    { timeout: 30_000, maxWait: 5_000 },
  );

  return { count: created.length };
}

/**
 * 명단. 학년·반을 주면 그만큼 좁히고, 안 주면 전교다. 반은 그 학년도 기준,
 * 합계는 트랙 규칙을 따른다 — 반 편성은 학년도 개념이지만 기숙사 점수는 아니다.
 */
export async function getClassRoster(actor: SessionUser, params: ClassRosterInput) {
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

/**
 * 이름 또는 학생코드로 찾는다. 반·번호·학적은 현재 학년도 기준이다.
 * 학적을 함께 내는 것은 **부여를 막는 근거가 그 값**이기 때문이다 — 화면이 학급
 * 자리에 학적을 적어, 고르기 전에 부여할 수 없는 학생임을 알 수 있게 한다.
 * 소속은 재학인 줄에서만 쓴다. 빠진 학생은 includeRemoved를 켜야 나온다.
 */
export async function searchStudents(
  actor: SessionUser,
  query: string,
  options: { includeRemoved?: boolean } = {},
) {
  await assertCan(actor, "merit:read:any");

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const year = await getCurrentYear();
  // 4자리 숫자면 학번으로도 읽는다. 아니면 null이 되어 이름·학생코드만 본다 —
  // 어느 쪽이든 한 번의 질의로 끝난다.
  const rows = await repo.searchStudents(trimmed, year, {
    includeRemoved: options.includeRemoved ?? false,
    studentNumber: parseStudentNumber(trimmed) ?? undefined,
  });

  return rows.map((row) => {
    const enrollment = row.enrollments[0];
    const enrolled = enrollment?.status === "ENROLLED" ? enrollment : null;
    return {
      studentProfileId: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      grade: enrolled?.grade ?? null,
      classNo: enrolled?.classNo ?? null,
      number: enrolled?.number ?? null,
      // 그 학년도 재적 줄이 아예 없으면 null이다.
      status: enrollment?.status ?? null,
      // 명단에서 빠졌는가 — 재적이 아니면 true다. 이 학생들은 소속이 비어 있어
      // 화면이 그 빈칸을 학적으로 설명한다. 판정은 부여 게이트와 같은 술어다.
      removed: enrollment?.status !== "ENROLLED",
    };
  });
}

/**
 * 이 학생에게 기록이 있는 학년도들. studentProfileId의 출처(URL·자녀 목록·세션)마다
 * 함수를 나누고 각자 자기 근거를 검사한다. 이쪽은 교사용이다.
 */
export async function listAwardYears(
  actor: SessionUser,
  studentProfileId: string,
): Promise<number[]> {
  await assertCan(actor, "merit:read:any");
  return repo.listAwardYears(studentProfileId);
}

/** 본인 조회. studentProfileId를 인자로 받지 않는다 — getMyMerit과 같은 이유. */
export async function listMyAwardYears(sessionUser: SessionUser): Promise<number[]> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listAwardYears(profile.id);
}

/** 학부모의 자녀 조회. 연결을 확인한다 — getChildMerit과 같은 근거다. */
export async function listChildAwardYears(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<number[]> {
  await assertIsChildOf(sessionUser, childProfileId);
  return repo.listAwardYears(childProfileId);
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
 * 이 학부모와 이 학생이 연결되어 있는가. can()으로 가를 수 없는 거부라 연결을
 * 직접 확인하고, 거부 감사로그는 assertCan과 같은 방식으로 남긴다.
 * 자녀를 보는 두 경로가 함께 쓴다 — 한쪽만 검사하면 그쪽이 우회로가 된다.
 */
async function assertIsChildOf(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<void> {
  if (await repo.isChildOf(sessionUser.id, childProfileId)) return;

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

/** 학부모의 자녀 조회. 연결 확인이 곧 권한이다. */
export async function getChildMerit(
  sessionUser: SessionUser,
  childProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertIsChildOf(sessionUser, childProfileId);
  return readMerit(childProfileId, track, year);
}

function recentAwardFilter(input: RecentAwardsExportInput): RecentAwardFilter {
  return {
    track: input.track,
    kind: input.kind,
    status: input.status,
    q: input.q,
  };
}

/** 최근 부여 흐름. 취소된 것도 보여주고, DB에서 20건씩 페이지를 자른다. */
export async function listRecentAwards(actor: SessionUser, query: RecentAwardsQuery) {
  await assertCan(actor, "merit:read:any");

  const filter = recentAwardFilter(query);
  const skip = (query.page - 1) * RECENT_AWARD_PAGE_SIZE;
  const [entries, total] = await Promise.all([
    repo.findRecentAwardPage(filter, skip, RECENT_AWARD_PAGE_SIZE),
    repo.countRecentAwards(filter),
  ]);

  return {
    entries,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / RECENT_AWARD_PAGE_SIZE)),
  };
}

// ── 엑셀 내보내기 ───────────────────────────────────────────────
//
// 시트 조립과 파일명은 서비스가 만든다 — 트랙별 조회 범위 규칙을 화면이 다시
// 알지 않아도 되게. 서버는 파일이 아니라 행렬만 돌려주고 클라이언트가 xlsx로 만든다.
// 읽기만 하므로 recordAudit을 남기지 않는다.

/** 반별 목록 시트. */
export async function exportClassRoster(
  actor: SessionUser,
  params: ClassRosterExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const year = params.year ?? (await getCurrentYear());
  const rows = await getClassRoster(actor, params);

  return {
    rows: toRosterSheet(rows, {
      track: params.track,
      year,
      grade: params.grade,
      classNo: params.classNo,
    }),
    filename: `${year}_${params.grade}학년${params.classNo}반_${
      MERIT_TRACK_LABELS[params.track]
    }상벌점.xlsx`,
  };
}

/**
 * 한 학생의 내역 시트. 없는 학생은 빈 시트를 만들지 않고 던진다 —
 * 이름 없는 파일이 나가면 받은 사람이 "기록이 없는 학생"으로 읽는다.
 */
export async function exportStudentHistory(
  actor: SessionUser,
  params: StudentHistoryExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const [header, view] = await Promise.all([
    getStudentHeader(actor, params.studentProfileId),
    getStudentMerit(actor, params.studentProfileId, params.track, params.year),
  ]);
  if (!header) throw new MeritError("STUDENT_NOT_FOUND");

  // view.year가 null인 것이 곧 "누적"이라는 뜻이다 (scopeYear가 정한다).
  const scope = view.year === null ? "누적" : `${view.year}`;

  return {
    rows: toHistorySheet(view.awards, {
      track: params.track,
      studentName: header.name,
    }),
    filename: `${header.name}_${MERIT_TRACK_LABELS[params.track]}상벌점_${scope}.xlsx`,
  };
}

/** 최근 부여의 현재 필터 전체를 시트로 만든다. 페이지 번호는 내보내기 범위가 아니다. */
export async function exportRecentAwards(
  actor: SessionUser,
  input: RecentAwardsExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const filter = recentAwardFilter(input);
  const awards = await repo.findRecentAwardsForExport(filter);

  return {
    rows: toRecentAwardsSheet(awards, filter),
    filename: `${MERIT_TRACK_LABELS[input.track]}_최근부여.xlsx`,
  };
}
