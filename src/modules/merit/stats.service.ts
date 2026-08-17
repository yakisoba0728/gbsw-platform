import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  demeritLevel,
  isYearScoped,
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
import * as repo from "./merit.repo";
import { scopeYear, sumTotals, type MeritTotals } from "./award.service";

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
  topRules: Awaited<ReturnType<typeof repo.topRules>>;
  /** 벌점이 기준(warn) 이상인 학생들 — 벌점 많은 순. 표시 전용이다. */
  watchList: WatchListRow[];
  /** 지금 적용 중인 기준. 화면에 적고 표의 강조 색도 이 값으로 칠한다. */
  thresholds: DemeritThresholds;
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

  const sums = await repo.demeritTotalsByStudent({
    track,
    totalsYear,
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
          grade: enrollment?.schoolClass?.grade ?? null,
          classNo: enrollment?.schoolClass?.classNo ?? null,
          number: enrollment?.number ?? null,
          demerit: row.demerit,
          level: demeritLevel(thresholds, row.demerit),
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
 * 대시보드용 가벼운 요약 — 머리글 숫자만. getMeritStats는 그래프용 기록을 전부
 * 읽어 오는데, 대시보드는 트랙 둘을 나란히 놓으면서 합계와 건수만 쓴다.
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
    topRules,
    watchList,
    thresholds,
  };
}

/** `2026-03` → 그 달 1일 00:00 KST. 조회 하한으로 쓴다. */
function monthStart(key: string): Date {
  const [year, month] = key.split("-");
  return new Date(`${year}-${month}-01T00:00:00+09:00`);
}
