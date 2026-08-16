import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import {
  DEMERIT_THRESHOLDS,
  demeritLevel,
  isYearScoped,
  type DemeritLevel,
  type MeritTrack,
} from "@/core/authz/merit-track";
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
 * 통계 화면(app/(app)/merit/stats)이 쓰는 집계.
 *
 * 부여·취소·조회(award.service)와 규정 관리(rule.service)에 이어 **세 번째 책임**이라
 * 파일을 나눈다 — CLAUDE.md의 "repo는 하나, 서비스는 책임별로 나눈다"이고, 화면
 * 경계와도 정확히 겹친다. 합계 접기(sumTotals)와 학년도 범위(scopeYear)는 조회와
 * 공유해야 하므로 award.service에서 가져다 쓴다. 이쪽에서 저쪽으로만 의존한다.
 */

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
