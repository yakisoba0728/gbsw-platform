import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  addKindPoints,
  addKindTotals,
  demeritLevel,
  emptyKindTotals,
  isYearScoped,
  withNetScore,
  type DemeritLevel,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { getDemeritThresholds } from "./threshold.service";
import {
  categoryDistribution,
  monthlyTotals,
  rollingMonths,
  schoolYearMonths,
  type CategorySlice,
  type MonthlyPoint,
} from "./merit.chart";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { kstDayStart } from "@/lib/datetime";
import * as repo from "./merit.repo";
import { scopeYear, sumTotals, type MeritTotals } from "./award.service";

/** 아직 아무것도 안 더한 합계. 부여자 줄을 만들 때의 출발점이다. */
const EMPTY_TOTALS: MeritTotals = withNetScore(emptyKindTotals());

/**
 * 통계 화면이 쓰는 집계. 합계 접기와 학년도 범위는 조회와 공유해야 하므로
 * award.service에서 가져다 쓴다 — 이쪽에서 저쪽으로만 의존한다.
 */

export type MeritStats = {
  /** 월별 추이 축 설명 — 교내는 학년도(3월~2월), 기숙사는 최근 12개월. */
  axisLabel: string;
  /**
   * 그래프가 덮는 기간. 머리글 합계·많이 나온 항목의 범위와 다를 수 있다 —
   * 기숙사는 합계가 누적인데 그래프만 최근 12개월이다. 화면이 그래프 옆에 적는다.
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
  topRules: TopRuleRow[];
  /** 벌점이 기준(warn) 이상인 학생들 — 벌점 많은 순. 표시 전용이다. */
  watchList: WatchListRow[];
  /** 지금 적용 중인 기준. 화면에 적고 표의 강조 색도 이 값으로 칠한다. */
  thresholds: DemeritThresholds;
};

/**
 * 기준 초과 명단의 한 줄. 소속이 없을 수 있다 — **반 미배정**이 그렇다.
 * 그래도 명단에는 오른다: 놓치기 가장 쉬운 자리가 그쪽이다.
 * 명단에서 빠진 학생(재적 아님)은 아예 오르지 않는다 — 아래 readWatchList를 볼 것.
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
 * 벌점이 기준(warn) 이상인 학생들 — 벌점 많은 순. 표시만 하며 회부·통보는
 * 일어나지 않는다. 기준은 인자로 받는다 — 명단·강조·문구가 같은 값을 봐야 한다.
 */
async function readWatchList(
  thresholds: DemeritThresholds,
  track: MeritTrack,
  totalsYear: number | null,
  rosterYear: number,
  studentProfileIds?: string[],
): Promise<WatchListRow[]> {
  const { warn } = thresholds;

  // rosterYear를 넘겨야 그 학년도 재적만 센다. 기숙사는 누적이라 이 조건이
  // 없으면 졸업생이 명단에 영원히 남는다 — repo 쪽 주석에 자세히 적었다.
  const sums = await repo.demeritTotalsByStudent({
    track,
    totalsYear,
    rosterYear,
    studentProfileIds,
  });

  // 기준 미만은 여기서 걸러 낸다 — "기준"이라는 업무 규칙이 서비스에 남는다.
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
      // 합계는 있는데 신원이 없으면 줄을 만들지 않는다 — 이름 없는 줄은 쓸모가 없다.
      if (!student) return [];

      const enrollment = student.enrollments[0];
      return [
        {
          studentProfileId: student.id,
          name: student.user.name,
          studentCode: student.studentCode,
          grade: enrollment?.grade ?? null,
          classNo: enrollment?.classNo ?? null,
          number: enrollment?.number ?? null,
          demerit: row.demerit,
          level: demeritLevel(thresholds, row.demerit),
        },
      ];
    })
    .sort((a, b) => b.demerit - a.demerit || a.name.localeCompare(b.name, "ko"));
}

/** 대시보드가 덮는 기간. 오늘을 포함한 날 수다. */
export const SUMMARY_DAYS = 7;

/** 최근 활동에서 세는 종류. 상쇄점은 뺀다 — 아래 getMeritSummary의 주석을 볼 것. */
const SUMMARY_KINDS = ["MERIT", "DEMERIT"] as const;

export type MeritSummary = {
  track: MeritTrack;
  /**
   * 상쇄점이 창에서 빠져 있으므로 offset은 항상 0이고 net은 상점 − 벌점이다.
   * MeritTotalsCards가 offset이 0이면 칸을 안 만드는 것이 여기서는 옳다 —
   * 감춘 게 아니라 실제로 세지 않은 값이다.
   */
  totals: MeritTotals & { awardCount: number };
  /**
   * 이 숫자들이 덮는 발생일 범위. 화면이 다시 계산하지 않는다 — 날 수를 화면에
   * 적으면 창을 바꿀 때 두 곳이 갈린다는 것과 같은 이유다.
   *
   * `to`는 오늘이다. 질의의 상한(`until`)은 내일 자정이지만 그건 **제외**라,
   * 그대로 적으면 화면에 내일 날짜가 뜬다.
   */
  window: { from: Date; to: Date };
};

/**
 * 대시보드용 요약 — **최근 7일에 무슨 일이 있었나**만 센다. 누적은 통계 화면이 맡는다.
 *
 * 세 가지가 이 함수의 판단이며, 화면이 다시 정하지 않는다.
 *
 * 1. **발생일(occurredOn) 기준이다.** 교사는 금요일 일을 월요일에 넣고 사감은
 *    어젯밤 점호를 아침에 넣는다 — 입력 시각으로 세면 밀린 기록을 한꺼번에 넣은
 *    날이 "사건이 몰린 주"로 보인다. 월별 추이도 같은 기준이라 두 화면이 어긋나지 않는다.
 * 2. **학년도로 자르지 않는다.** 3월 초에는 지난 7일이 두 학년도에 걸친다.
 *    학년도를 함께 걸면 2월 며칠치가 소리 없이 빠져 조용한 주로 읽힌다.
 * 3. **상쇄점을 통째로 뺀다.** 선도위의 상쇄는 한 건이 수십 점이라, 주간 활동에
 *    섞으면 그 한 건이 나머지 전부를 덮는다. 건수에서도 뺀다 — 절반만 빼면
 *    "3건인데 점수는 0점"처럼 서로 안 맞는 숫자가 남는다. 화면이 "상쇄점 제외"를 적는다.
 */
export async function getMeritSummary(
  actor: SessionUser,
  track: MeritTrack,
  /** 창의 기준 시각. 인자로 받아야 테스트가 오늘 날짜에 안 흔들린다. */
  now: Date = new Date(),
): Promise<MeritSummary> {
  await assertCan(actor, "merit:read:any");

  // 창 계산에는 학년도가 필요 없지만, 학년도가 없으면 숫자를 내지 않는다 —
  // 상벌점을 줄 수 없는 상태와 "이번 주는 조용했다"가 화면에서 똑같이 0으로
  // 보이기 때문이다. 화면은 이 오류를 안내 카드로 바꾼다.
  await getCurrentYear();

  // 오늘을 포함해 SUMMARY_DAYS일. 상한은 내일 자정(제외)이다.
  const today = kstDayStart(now);
  const since = addDays(today, -(SUMMARY_DAYS - 1));
  const until = addDays(today, 1);

  const rows = await repo.trackTotalsBetween({
    track,
    since,
    until,
    kinds: SUMMARY_KINDS,
  });

  return {
    track,
    window: { from: since, to: today },
    totals: {
      ...sumTotals(rows),
      awardCount: rows.reduce((sum, row) => sum + row._count._all, 0),
    },
  };
}

/** 한국은 서머타임이 없어 하루는 항상 24시간이다. */
function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 순위 표시는 교사 화면에만 둔다 — 학생에게 등수를 띄우는 건 별개 결정이다. */
const TOP_RULE_LIMIT = 10;

/** 「많이 나온 항목」 한 줄. 화면이 (구분·항목)을 행 key로 쓴다. */
export type TopRuleRow = {
  label: string;
  kind: string;
  count: number;
  points: number;
};

/**
 * 규정 하나를 한 줄로 만든다. repo는 (ruleId·label 스냅샷·kind)로 묶어 오므로
 * 이름을 고친 규정이 여러 줄로 온다 — repo가 붙여 준 **현재 이름**이 그 줄들을
 * 도로 하나로 모은다(getRuleStats가 ruleId로 접는 것과 같은 결과다).
 *
 * 접는 열쇠를 ruleId가 아니라 (kind·label)로 두는 이유: 화면이 그 둘을 행 key로
 * 쓴다. 이름이 같은 별개 규정 둘을 따로 내면 같은 key가 두 번 나온다 — 화면에서
 * 구분되지도 않는 두 줄이다.
 */
function foldTopRules(rows: Awaited<ReturnType<typeof repo.topRules>>): TopRuleRow[] {
  const folded = new Map<string, TopRuleRow>();

  for (const row of rows) {
    const key = `${row.kind}\u0000${row.label}`;
    const cur = folded.get(key);
    if (!cur) {
      folded.set(key, {
        label: row.label,
        kind: row.kind,
        count: row.count,
        points: row.points,
      });
      continue;
    }
    cur.count += row.count;
    cur.points += row.points;
  }

  // 건수는 흔하게 같다 — 자르는 자리에 동점이 걸리면 어느 항목이 남는지가
  // 호출마다 달라진다. 이름·구분까지 보조 정렬키로 두면 그 자리가 고정된다.
  return [...folded.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.label.localeCompare(b.label, "ko") ||
        a.kind.localeCompare(b.kind),
    )
    .slice(0, TOP_RULE_LIMIT);
}

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

  // 합계 범위는 트랙 규칙을 따르고, 반 편성은 언제나 어느 학년도의 것인지가 필요하다.
  const scoped = await scopeYear(track, year);
  const rosterYear = year ?? (await getCurrentYear());

  // 기준은 여기서 한 번 읽어 명단·화면에 같은 값을 쓴다 (읽기는 캐시된다).
  const thresholds = await getDemeritThresholds(track);

  // 기숙사는 학년도 경계가 없다 — 최근 12개월만 그린다. 아니면 축이 3년치로 늘어난다.
  const axis = isYearScoped(track)
    ? schoolYearMonths(scoped ?? rosterYear)
    : rollingMonths(now);
  // since는 그래프 조회에만 넘긴다 — 합계까지 자르면 같은 학생의 숫자가
  // 화면마다 달라진다. 그래프가 덮는 기간은 chartRange로 내보낸다.
  const since = isYearScoped(track) ? undefined : monthStart(axis[0].key);

  // 학생 목록을 먼저 뽑아야 나머지 질의에 넘길 수 있어서 이 조회만 앞선다.
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

  // 반이 비면 빈 배열이 되는데, Prisma의 `in: []`가 그대로 빈 결과를 준다.
  //
  // 반을 안 골랐을 때 학생 조건이 통째로 빠지면 머리글·항목·그래프가 「반별
  // 현황」과 다른 모집단을 센다(퇴학·졸업으로 재적이 끊긴 학생이 머리글에만
  // 남는다). rosterYear를 넘겨 repo가 같은 명단 술어를 걸게 한다.
  const [totalRows, classes, topRules, chartAwards, watchList] = await Promise.all([
    repo.trackTotals({ track, totalsYear: scoped, rosterYear, studentProfileIds }),
    repo.classSummaries({ year: rosterYear, track, totalsYear: scoped }),
    repo.topRules({ track, totalsYear: scoped, rosterYear, studentProfileIds }),
    repo.listAwardsForChart({
      track,
      year: scoped,
      since,
      rosterYear,
      studentProfileIds,
    }),
    readWatchList(thresholds, track, scoped, rosterYear, studentProfileIds),
  ]);

  const totals = sumTotals(totalRows);
  const awardCount = totalRows.reduce((sum, row) => sum + row._count._all, 0);

  return {
    track,
    year: scoped,
    rosterYear,
    scope: scope ?? null,
    students: classRoster,
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
    topRules: foldTopRules(topRules),
    watchList,
    thresholds,
  };
}

/** `2026-03` → 그 달 1일 00:00 KST. 조회 하한으로 쓴다. */
function monthStart(key: string): Date {
  const [year, month] = key.split("-");
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}

// ── 화면별 집계 ────────────────────────────────────────────────
//
// getMeritStats 하나에 다 붙이지 않고 화면마다 나눈다 — 통계가 여러 화면으로
// 갈라졌고, 한 덩어리로 두면 어느 화면이든 자기가 안 쓰는 질의까지 치른다.

export type TeacherRow = {
  /** 계정이 지워졌으면 null. 그때는 이름 스냅샷이 유일한 신원이다. */
  userId: string | null;
  name: string;
  /** 계정이 사라진 사람인가. 화면이 배지로 구분한다. */
  removed: boolean;
  totals: MeritTotals;
  awardCount: number;
};

export type TeacherStats = {
  track: MeritTrack;
  year: number | null;
  rows: TeacherRow[];
  /** 부여한 사람이 몇 명인가. 표 머리글에 적는다. */
  teacherCount: number;
};

/**
 * 부여자별 집계. "누가 얼마나 줬나"는 교사 사이의 기준 차이를 드러내는 유일한
 * 자료다 — 같은 반에서 한 사람만 벌점을 몰아 주고 있으면 여기서만 보인다.
 *
 * 순위를 매기지 않는다. 많이 준 사람이 일을 잘한 것도, 못한 것도 아니다 —
 * 숫자만 내고 해석은 사람이 한다.
 */
export async function getTeacherStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<TeacherStats> {
  await assertCan(actor, "merit:read:any");

  const scoped = await scopeYear(track, year);
  const { byUser, byName } = await repo.teacherTotals({ track, totalsYear: scoped });

  // 살아 있는 계정은 지금 이름을 쓴다 — 스냅샷은 개명 전 이름일 수 있다.
  const ids = [...new Set(byUser.map((r) => r.awardedByUserId!))];
  const users = await repo.findUserNames(ids);
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const rows = new Map<string, TeacherRow>();

  for (const row of byUser) {
    const id = row.awardedByUserId!;
    const key = `u:${id}`;
    const entry =
      rows.get(key) ??
      ({
        userId: id,
        name: nameById.get(id) ?? "이름 없음",
        removed: false,
        totals: EMPTY_TOTALS,
        awardCount: 0,
      } satisfies TeacherRow);
    rows.set(key, addTeacherRow(entry, row));
  }

  for (const row of byName) {
    const key = `n:${row.awardedByName}`;
    const entry =
      rows.get(key) ??
      ({
        userId: null,
        name: row.awardedByName,
        removed: true,
        totals: EMPTY_TOTALS,
        awardCount: 0,
      } satisfies TeacherRow);
    rows.set(key, addTeacherRow(entry, row));
  }

  const list = [...rows.values()].sort(
    (a, b) => b.awardCount - a.awardCount || a.name.localeCompare(b.name, "ko"),
  );

  return { track, year: scoped, rows: list, teacherCount: list.length };
}

/** 한 줄에 종류별 합계를 더한다. 접는 규칙은 merit-track이 갖고 있다. */
function addTeacherRow(
  row: TeacherRow,
  group: { kind: string; _count: { _all: number }; _sum: { points: number | null } },
): TeacherRow {
  const totals = emptyKindTotals();
  addKindTotals(totals, row.totals);
  addKindPoints(totals, group.kind, group._sum.points ?? 0);
  return {
    ...row,
    totals: withNetScore(totals),
    awardCount: row.awardCount + group._count._all,
  };
}

export type RuleStatRow = {
  ruleId: string;
  /** 규정의 **현재** 이름. 부여 기록에 박힌 이름은 부여 시점 스냅샷이라 옛것일 수 있다. */
  label: string;
  kind: string;
  category: string | null;
  /** 규정 관리에서 지워진 규정인가. 기록은 남아 여기 나온다. */
  deleted: boolean;
  count: number;
  points: number;
};

export type RuleStats = {
  track: MeritTrack;
  year: number | null;
  /** 규정 하나에 한 줄이다 — 화면이 ruleId를 막대 폭의 열쇠와 행 key로 쓴다. */
  rows: RuleStatRow[];
  /** 한 번도 쓰이지 않은 규정. 규정표를 다듬는 자료다. */
  unused: Awaited<ReturnType<typeof repo.unusedRules>>;
  /** 부여 건수 합계 — 각 줄의 비중을 화면이 계산할 수 있게. */
  totalCount: number;
};

/**
 * 규정별 집계. 「많이 나온 항목」의 상위 10개와 달리 **전부** 낸다 —
 * 규정표를 손보려면 안 쓰이는 항목까지 봐야 하고, 그게 이 화면의 목적이다.
 */
export async function getRuleStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<RuleStats> {
  await assertCan(actor, "merit:read:any");

  const scoped = await scopeYear(track, year);
  const [{ rows, rules }, unused] = await Promise.all([
    repo.ruleStats({ track, totalsYear: scoped }),
    repo.unusedRules({ track, totalsYear: scoped }),
  ]);

  const byId = new Map(rules.map((r) => [r.id, r]));

  // 한 규정이 여러 줄로 오는 것을 여기서 접는다. 부여 기록의 label은 부여 시점
  // 스냅샷이고 규정 수정이 이름을 바꿀 수 있어(updateRuleSchema), 이름을 고친 뒤
  // 다시 부여하면 같은 ruleId가 이름별로 나뉜 채 온다. 접지 않으면 화면이
  // ruleId를 막대 폭의 열쇠와 행 key로 쓰므로 뒤 줄이 앞 줄을 덮고,
  // 「쓰인 규정」·「삭제된 규정」이 규정 수가 아니라 (규정×이름) 수를 센다.
  // kind는 갈라지지 않는다 — 수정 스키마가 kind를 받지 않는다.
  const folded = new Map<string, RuleStatRow>();

  for (const row of rows) {
    const count = row._count._all;
    const points = row._sum.points ?? 0;
    const cur = folded.get(row.ruleId);

    if (cur) {
      cur.count += count;
      cur.points += points;
      continue;
    }

    const rule = byId.get(row.ruleId);
    folded.set(row.ruleId, {
      ruleId: row.ruleId,
      // 규정의 현재 이름을 쓴다 — 이름을 고친 직후 옛 이름이 뜨면 방금 고친 사람이
      // 자기가 고친 항목을 못 찾는다. 규정 행은 지우는 경로가 없어 언제나 찾히지만,
      // 못 찾으면 스냅샷으로 떨어진다.
      label: rule?.label ?? row.label,
      kind: row.kind,
      category: rule?.category ?? null,
      // active가 false면 규정 관리에서 지운 것이다. 기록은 남으므로 여기 나온다.
      deleted: rule?.active === false,
      count,
      points,
    });
  }

  // 이름이 같은 규정이 둘 있을 수 있다(MeritRule.label에 유일 제약이 없다) —
  // ruleId까지 봐야 순서가 호출마다 안 바뀐다.
  const list: RuleStatRow[] = [...folded.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label, "ko") ||
      a.ruleId.localeCompare(b.ruleId),
  );

  return {
    track,
    year: scoped,
    rows: list,
    unused,
    totalCount: list.reduce((sum, r) => sum + r.count, 0),
  };
}

export type RankedStudent = Awaited<ReturnType<typeof repo.listClassRoster>>[number] & {
  /** 같은 순점수는 같은 등수다. 다음 등수는 인원만큼 건너뛴다 (1,2,2,4). */
  rank: number;
  level: DemeritLevel;
};

export type RankingStats = {
  track: MeritTrack;
  year: number | null;
  rosterYear: number;
  /** 반을 골랐으면 그 반. 안 골랐으면 null(전교). */
  scope: { grade: number; classNo: number } | null;
  /**
   * 전교면 순점수 순, 반을 골랐으면 **번호순**이다. 반 안에서는 등수보다
   * 명단이 먼저다 — 담임이 찾는 것은 "몇 등"이 아니라 "그 학생 줄"이다.
   */
  students: RankedStudent[];
  /** 반 순위 — 1인 평균 순점수 순. 인원이 다른 반을 합계로 줄 세우면 큰 반이 불리하다. */
  classes: (Awaited<ReturnType<typeof repo.classSummaries>>[number] & { rank: number })[];
  thresholds: DemeritThresholds;
};

/**
 * 순위·현황. 전교에서는 학생과 반을 각각 줄 세우고, 반을 고르면 그 반 **전원**을
 * 번호순으로 낸다 — 점수가 있는 학생만 내면 명단에 구멍이 생겨 "빠진 건지 0점인지"를
 * 구별할 수 없다.
 */
export async function getRankingStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
  scope?: { grade: number; classNo: number },
): Promise<RankingStats> {
  await assertCan(actor, "merit:read:any");

  const scoped = await scopeYear(track, year);
  const rosterYear = year ?? (await getCurrentYear());
  const thresholds = await getDemeritThresholds(track);

  // 두 갈래를 따로 쓴다 — 한 삼항으로 묶으면 두 조회의 합집합 타입이 되어
  // 어느 쪽에도 없는 필드를 컴파일러가 막지 못한다.
  const classesPromise = repo.classSummaries({
    year: rosterYear,
    track,
    totalsYear: scoped,
  });

  let students: RankedStudent[];
  if (scope) {
    // repo가 이미 번호순으로 준다. 반 소속은 고른 반 그 자체다.
    const roster = await repo.listClassRoster({
      year: rosterYear,
      grade: scope.grade,
      classNo: scope.classNo,
      track,
      totalsYear: scoped,
    });
    students = withRanks(
      roster.map((r) => ({ ...r, grade: scope.grade, classNo: scope.classNo })),
      thresholds,
      true,
    );
  } else {
    // 범위를 주지 않는다 — 순위는 전교가 대상이고 반 미배정 학생도 들어가야 한다.
    const all = await repo.listClassRoster({ year: rosterYear, track, totalsYear: scoped });
    students = withRanks(
      [...all].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, "ko")),
      thresholds,
      false,
    );
  }

  return {
    track,
    year: scoped,
    rosterYear,
    scope: scope ?? null,
    students,
    classes: rankClasses(await classesPromise),
    thresholds,
  };
}

/**
 * 등수를 매긴다. 반을 볼 때는 번호순이라 등수가 뜻을 잃으므로 붙이지 않는다(0).
 * 동점은 같은 등수다 — 1점 차이도 아닌데 줄을 세우면 그 숫자가 사실보다 세진다.
 */
function withRanks<T extends { net: number; demerit: number }>(
  rows: T[],
  thresholds: DemeritThresholds,
  skipRank: boolean,
): (T & { rank: number; level: DemeritLevel })[] {
  let rank = 0;
  let lastNet: number | null = null;

  return rows.map((row, i) => {
    if (!skipRank && row.net !== lastNet) {
      rank = i + 1;
      lastNet = row.net;
    }
    return { ...row, rank: skipRank ? 0 : rank, level: demeritLevel(thresholds, row.demerit) };
  });
}

/** 반 등수. 1인 평균으로 센다 — 인원이 다른 반을 합계로 줄 세우면 큰 반이 불리하다. */
function rankClasses<T extends { avgNet: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.avgNet - a.avgNet);
  let rank = 0;
  let last: number | null = null;
  return sorted.map((row, i) => {
    if (row.avgNet !== last) {
      rank = i + 1;
      last = row.avgNet;
    }
    return { ...row, rank };
  });
}
