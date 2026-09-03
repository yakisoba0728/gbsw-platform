import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  isYearScoped,
  type MeritTrack,
} from "@/core/authz/merit-track";
import {
  addKindPoints,
  addKindTotals,
  demeritLevel,
  emptyKindTotals,
  type DemeritLevel,
  type DemeritThresholds,
  withNetScore,
} from "./merit.points";
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
import { SUMMARY_DAYS } from "./merit.schema";
import * as repo from "./merit.repo";
import { scopeYear, sumTotals, type MeritTotals } from "./award.service";

const EMPTY_TOTALS: MeritTotals = withNetScore(emptyKindTotals());

type ClassRosterRow = Awaited<ReturnType<typeof repo.listClassRoster>>[number];

type ClassSummary = {
  grade: number;
  classNo: number;
  students: number;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
  avgNet: number;
};

export function foldClasses(rows: readonly ClassRosterRow[]): ClassSummary[] {
  const byClass = new Map<
    string,
    {
      grade: number;
      classNo: number;
      students: number;
      merit: number;
      demerit: number;
      offset: number;
    }
  >();

  for (const row of rows) {
    const { grade, classNo } = row;
    if (grade === null || classNo === null) continue;

    const key = `${grade}-${classNo}`;
    const current =
      byClass.get(key) ?? { grade, classNo, students: 0, ...emptyKindTotals() };
    current.students += 1;
    addKindTotals(current, row);
    byClass.set(key, current);
  }

  return [...byClass.values()]
    .map((row) => {
      const net = withNetScore(row).net;
      return {
        ...row,
        net,
        avgNet: Math.round((net / row.students) * 10) / 10,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
}

export type MeritStats = {
  axisLabel: string;
  /* 기숙사는 합계가 누적이고 그래프만 최근 12개월이다. */
  chartRange: string;
  monthly: MonthlyPoint[];
  categories: CategorySlice[];
  scope: { grade: number; classNo: number } | null;
  students: Awaited<ReturnType<typeof repo.listClassRoster>> | null;
  track: MeritTrack;
  year: number | null;
  rosterYear: number;
  totals: MeritTotals & { awardCount: number };
  classes: ClassSummary[];
  topRules: TopRuleRow[];
  watchList: WatchListRow[];
  thresholds: DemeritThresholds;
};

type WatchListRow = {
  studentProfileId: string;
  name: string;
  studentCode: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  demerit: number;
  level: DemeritLevel;
};

async function readWatchList(
  thresholds: DemeritThresholds,
  track: MeritTrack,
  totalsYear: number | null,
  rosterYear: number,
  studentProfileIds?: string[],
): Promise<WatchListRow[]> {
  const { warn } = thresholds;

  const sums = await repo.demeritTotalsByStudent({
    track,
    totalsYear,
    rosterYear,
    studentProfileIds,
  });

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

const SUMMARY_KINDS = ["MERIT", "DEMERIT"] as const;

type MeritSummary = {
  track: MeritTrack;
  totals: MeritTotals & { awardCount: number };
  window: { from: Date; to: Date };
};

/* 최근 7일의 occurredOn 기준으로 학년도 경계 없이 집계하며 상쇄는 제외한다. */
export async function getMeritSummary(
  actor: SessionUser,
  track: MeritTrack,
  now: Date = new Date(),
): Promise<MeritSummary> {
  await assertCan(actor, "merit:read:any");

  await getCurrentYear();

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

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

const TOP_RULE_LIMIT = 10;

type TopRuleRow = {
  label: string;
  kind: string;
  count: number;
  points: number;
};

type AwardsByRule = Awaited<ReturnType<typeof repo.awardsByRule>>;
type CurrentRule = AwardsByRule["rules"][number];

function indexCurrentRules(rules: readonly CurrentRule[]): Map<string, CurrentRule> {
  return new Map(rules.map((rule) => [rule.id, rule]));
}

function currentRuleLabel(
  row: AwardsByRule["rows"][number],
  rulesById: ReadonlyMap<string, CurrentRule>,
): string {
  return rulesById.get(row.ruleId)?.label ?? row.label;
}

function foldTopRules({ rows, rules }: AwardsByRule): TopRuleRow[] {
  const folded = new Map<string, TopRuleRow>();
  const rulesById = indexCurrentRules(rules);

  for (const row of rows) {
    const label = currentRuleLabel(row, rulesById);
    const count = row._count._all;
    const points = row._sum.points ?? 0;
    const key = `${row.kind}\u0000${label}`;
    const cur = folded.get(key);
    if (!cur) {
      folded.set(key, {
        label,
        kind: row.kind,
        count,
        points,
      });
      continue;
    }
    cur.count += count;
    cur.points += points;
  }

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
  now: Date = new Date(),
  scope?: { grade: number; classNo: number },
): Promise<MeritStats> {
  await assertCan(actor, "merit:read:any");

  const scoped = await scopeYear(track, year);
  const rosterYear = year ?? (await getCurrentYear());

  const thresholds = await getDemeritThresholds(track);

  const axis = isYearScoped(track)
    ? schoolYearMonths(scoped ?? rosterYear)
    : rollingMonths(now);
  const since = isYearScoped(track) ? undefined : monthStart(axis[0].key);

  const allRoster = await repo.listClassRoster({
    year: rosterYear,
    track,
    totalsYear: scoped,
  });
  const classRoster = scope
    ? allRoster.filter((row) => row.grade === scope.grade && row.classNo === scope.classNo)
    : null;
  const studentProfileIds = classRoster?.map((r) => r.studentProfileId);

  const [totalRows, ruleAwards, chartAwards, watchList] = await Promise.all([
    repo.trackTotals({ track, totalsYear: scoped, rosterYear, studentProfileIds }),
    repo.awardsByRule({ track, totalsYear: scoped, rosterYear, studentProfileIds }),
    repo.listAwardsForChart({
      track,
      totalsYear: scoped,
      since,
      rosterYear,
      studentProfileIds,
    }),
    readWatchList(thresholds, track, scoped, rosterYear, studentProfileIds),
  ]);

  const totals = sumTotals(totalRows);
  const awardCount = totalRows.reduce((sum, row) => sum + row._count._all, 0);
  const classes = foldClasses(allRoster);

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
    topRules: foldTopRules(ruleAwards),
    watchList,
    thresholds,
  };
}

function monthStart(key: string): Date {
  const [year, month] = key.split("-");
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}

type TeacherRow = {
  userId: string | null;
  name: string;
  removed: boolean;
  totals: MeritTotals;
  awardCount: number;
};

export type TeacherStats = {
  track: MeritTrack;
  year: number | null;
  rows: TeacherRow[];
  teacherCount: number;
};

export async function getTeacherStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<TeacherStats> {
  await assertCan(actor, "merit:read:any");

  const rosterYear = year ?? (await getCurrentYear());
  const scoped = await scopeYear(track, rosterYear);
  const { byUser, byName } = await repo.teacherTotals({
    track,
    totalsYear: scoped,
    rosterYear,
  });

  const ids = [
    ...new Set(
      byUser.flatMap((row) =>
        row.awardedByUserId === null ? [] : [row.awardedByUserId],
      ),
    ),
  ];
  const users = await repo.findUserNames(ids);
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const rows = new Map<string, TeacherRow>();

  for (const row of byUser) {
    const id = row.awardedByUserId;
    if (id === null) continue;
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
  label: string;
  kind: string;
  category: string | null;
  deleted: boolean;
  count: number;
  points: number;
};

export type RuleStats = {
  track: MeritTrack;
  year: number | null;
  rows: RuleStatRow[];
  unused: Awaited<ReturnType<typeof repo.unusedRules>>;
  totalCount: number;
};

export async function getRuleStats(
  actor: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<RuleStats> {
  await assertCan(actor, "merit:read:any");

  const rosterYear = year ?? (await getCurrentYear());
  const scoped = await scopeYear(track, rosterYear);
  const [{ rows, rules }, unused] = await Promise.all([
    repo.awardsByRule({ track, totalsYear: scoped, rosterYear }),
    repo.unusedRules({ track, totalsYear: scoped }),
  ]);

  const byId = indexCurrentRules(rules);

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
      label: currentRuleLabel(row, byId),
      kind: row.kind,
      category: rule?.category ?? null,
      deleted: rule?.active === false,
      count,
      points,
    });
  }

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
  rank: number;
  level: DemeritLevel;
};

export type RankingStats = {
  track: MeritTrack;
  year: number | null;
  rosterYear: number;
  scope: { grade: number; classNo: number } | null;
  students: RankedStudent[];
  classes: (ClassSummary & { rank: number })[];
  thresholds: DemeritThresholds;
};

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

  const all = await repo.listClassRoster({
    year: rosterYear,
    track,
    totalsYear: scoped,
  });

  let students: RankedStudent[];
  if (scope) {
    const roster = all.filter(
      (row) => row.grade === scope.grade && row.classNo === scope.classNo,
    );
    students = withRanks(roster, thresholds, true);
  } else {
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
    classes: rankClasses(foldClasses(all)),
    thresholds,
  };
}

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
