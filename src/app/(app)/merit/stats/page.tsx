import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission, type SessionUser } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonStats, SkeletonTable } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { DemeritCell } from "@/components/merit/demerit-level";
import {
  CategoryChart,
  ClassNetChart,
  MonthlyChart,
  StudentNetChart,
} from "@/components/merit/charts";
import { getMeritStats, type MeritStats } from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "상벌점 통계" };

export default async function MeritStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year)
      ? Number(raw.year)
      : undefined;

  // 반을 골랐으면 그 반만 본다. 둘 다 유효할 때만 적용한다 —
  // 하나만 있는 중간 상태는 전교로 떨어진다.
  const grade = numberParam(raw.grade, 1, 3);
  const classNo = numberParam(raw.classNo, 1, 20);
  const scope = grade !== null && classNo !== null ? { grade, classNo } : undefined;

  /** 지금 쿼리를 유지한 채 일부만 바꾼 주소. 트랙 탭과 반 선택이 함께 쓴다. */
  function statsHref(patch: Record<string, string | null>): string {
    return hrefWith("/merit/stats", raw, patch);
  }

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 트랙 탭과
  // 범위 배지까지 뼈대로 덮인다 — 방금 고른 조건이 사라지는 그 증상이다.
  // 두 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const statsPromise = loadStats(actor, track, year, scope);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 옛 내용을 그대로 보여준다 — key가 없으면 탭을 눌러도 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({ track, year, grade, classNo });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="상벌점 통계"
        hint={
          // 집계 범위는 데이터에서 나온다 — 본문과 같은 약속을 나눠 기다린다.
          <Suspense key={boundaryKey} fallback={<HintSkeleton />}>
            <RangeHint promise={statsPromise} track={track} />
          </Suspense>
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => statsHref({ track: t })}
            size="sm"
          />
        }
      >
        {scope && (
          // 배지는 지금 고른 조건이다 — 서비스의 scope는 받은 인자를 그대로 돌려주므로
          // 데이터를 기다릴 이유가 없다. 경계 밖에 남긴다.
          //
          // 링크는 배지 밖에 둔다 — 안에 넣고 손가락 크기(min-h-9)를 주면
          // 배지가 40px짜리 알약이 되어 상태 표시가 아니라 버튼으로 읽힌다.
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" dot={false}>
              {scope.grade}학년 {scope.classNo}반만 보는 중
            </Badge>
            {/*
              ✕는 "누르면 이 필터가 풀린다"는 장식이다 — 링크 이름에 넣지 않는다.
              gap-1이 낱말 사이 공백을 대신한다 — inline-flex는 글자와 ✕ 사이의
              공백을 지워 "전교 보기✕"로 붙여 놓는다(BackLink와 같은 규격이다).
            */}
            <Link
              href={statsHref({ grade: null, classNo: null })}
              className="inline-flex min-h-9 items-center gap-1 text-sm text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
            >
              전교 보기 <span aria-hidden>✕</span>
            </Link>
          </div>
        )}
      </SectionCard>

      {/* 합계·그래프·표가 전부 같은 조회에서 나온다 — 경계를 하나로 둬야 한꺼번에 들어온다.
          덩어리마다 나누면 화면이 조각조각 채워져 더 어수선하다. */}
      <Suspense key={boundaryKey} fallback={<StatsSkeleton />}>
        <StatsBody promise={statsPromise} track={track} statsHref={statsHref} />
      </Suspense>
    </div>
  );
}

type StatsPromise = Promise<MeritStats | null>;

/**
 * 현재 학년도가 없으면 안내로 바꾼다. 페이지에서 try/catch로 잡으면 거기서 기다리게 되고,
 * 경계 밖에서 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 */
async function loadStats(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
  scope: { grade: number; classNo: number } | undefined,
): StatsPromise {
  try {
    return await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

/** 집계 범위 한 줄. 본문과 같은 약속을 기다리므로 질의가 늘지 않는다. */
async function RangeHint({
  promise,
  track,
}: {
  promise: StatsPromise;
  track: MeritTrack;
}) {
  const stats = await promise;
  if (!stats) return null;

  return (
    <>
      {isYearScoped(track)
        ? `${stats.year}학년도 집계 · 반 편성 ${stats.rosterYear}학년도`
        : `입학부터 전체 누적 · 반 편성 ${stats.rosterYear}학년도`}
    </>
  );
}

/** 집계에서 나오는 것 전부. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function StatsBody({
  promise,
  track,
  statsHref,
}: {
  promise: StatsPromise;
  track: MeritTrack;
  statsHref: (patch: Record<string, string | null>) => string;
}) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  return (
    <>
      {/* 뷰포트가 아니라 놓인 자리의 폭을 본다 — MeritTotalsCards와 같은 기준이다. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5">
          <StatTile
            label="상점"
            value={stats.totals.merit}
            valueClassName="text-blue"
          />
          <StatTile
            label="벌점"
            value={stats.totals.demerit}
            valueClassName="text-rose"
          />
          <StatTile
            label="상쇄점"
            value={stats.totals.offset}
            valueClassName="text-green"
          />
          <StatTile
            label="순점수"
            value={signedNet(stats.totals.net)}
            valueClassName={stats.totals.net >= 0 ? "text-green" : "text-rose"}
          />
          <StatTile
            label="부여 건수"
            value={stats.totals.awardCount}
            valueClassName="text-ink"
          />
        </div>
      </div>

      <MonthlyChart points={stats.monthly} axisLabel={stats.axisLabel} />

      {stats.scope && stats.students ? (
        <StudentNetChart
          rows={stats.students}
          thresholds={stats.thresholds}
          hrefFor={(id) => `/merit/students/${id}?track=${track}`}
        />
      ) : (
        <ClassNetChart
          rows={stats.classes}
          hrefFor={(row) =>
            statsHref({ grade: String(row.grade), classNo: String(row.classNo) })
          }
        />
      )}

      <CategoryChart slices={stats.categories} scopeLabel={stats.chartRange} />

      <WatchList
        rows={stats.watchList}
        track={track}
        thresholds={stats.thresholds}
        scoped={stats.scope !== null}
      />

      <ClassTable rows={stats.classes} />
      <TopRules rows={stats.topRules} />
    </>
  );
}

/**
 * hint는 <p> 안에 들어간다 — Skeleton은 <div>라 문단에 넣으면 브라우저가 문단을
 * 먼저 닫아 버려 하이드레이션이 어긋난다. 같은 규격을 인라인으로 쓴다.
 */
function HintSkeleton() {
  return (
    <span className="inline-block h-4 w-64 max-w-full animate-pulse rounded-btn bg-soft align-middle" />
  );
}

/**
 * 합계·그래프·표 자리. 개수를 화면과 맞춘다 — 어긋나면 집계가 도착할 때 자리가
 * 통째로 다시 짜인다. 바깥과 같은 space-y-4라 간격도 그대로다.
 */
function StatsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={5} />

      {/* 월별 추이 · 반별(학생별) 순점수 · 분류별 분포 */}
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />

      {/* 표는 셋이다 — 기준 초과 학생 · 반별 현황 · 많이 나온 항목. */}
      <SkeletonTable rows={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />

      {/* 맨 뒤에 둔다 — 앞에 두면 space-y가 첫 칸을 16px 밀어 내린다. */}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 기준을 넘긴 학생 명단. 표시만 하며 회부·통보는 일어나지 않는다. */
function WatchList({
  rows,
  track,
  thresholds,
  scoped,
}: {
  rows: MeritStats["watchList"];
  track: MeritTrack;
  thresholds: DemeritThresholds;
  /** 반을 골라 보는 중인가. 명단의 범위를 문구에 적는다. */
  scoped: boolean;
}) {
  const where = scoped ? "이 반" : "전교";

  // 순위는 셀 함수가 볼 수 없다(행만 받는다) — 미리 붙여 둔다.
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));

  const columns: Column<(typeof ranked)[number]>[] = [
    {
      key: "rank",
      header: "#",
      width: "w-[48px]",
      cell: (row) => <span className="text-mut2">{row.rank}</span>,
    },
    {
      key: "name",
      header: "이름",
      card: "title",
      cell: (row) => (
        <Link
          href={`/merit/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "class",
      header: "학급",
      width: "w-[132px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        <span className="text-mut">
          {/* 소속이 없어도 명단에서 빼지 않는다 — 반 미배정 학생이 놓치기 쉽다. */}
          {row.grade !== null && row.classNo !== null
            ? `${row.grade}학년 ${row.classNo}반${row.number !== null ? ` ${row.number}번` : ""}`
            : "소속 미배정"}
        </span>
      ),
    },
    {
      key: "demerit",
      header: "벌점",
      // 마지막 열이라 좌우 여백이 px-5다 — 테두리 붙은 세 자리 수가 들어가려면
      // 84px로는 모자란다.
      width: "w-[100px]",
      card: "trailing",
      cell: (row) => <DemeritCell thresholds={thresholds} demerit={row.demerit} />,
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="기준 초과 학생"
      // 기준 숫자를 적는다 — 교사가 설정에서 바꾸는 값이라 안 보이면 명단 길이가 설명되지 않는다.
      hint={
        <>
          {where}에서 벌점 {thresholds.warn}점 이상인 학생입니다. 벌점 총합 기준이며,
          회부·통보는 일어나지 않습니다.
        </>
      }
      // 둘째 문단은 controls로 넘긴다 — hint는 <p> 하나라 안에 문단을 또 넣을 수 없다.
      controls={
        <p className="mt-1 text-xs text-mut">
          기준 점수는{" "}
          <Link
            href="/admin/settings"
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            설정
          </Link>
          에서 바꿉니다.
        </p>
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">
          {where}에 벌점 {thresholds.warn}점 이상인 학생이 없습니다.
        </EmptyState>
      ) : (
        <DataTable
          minWidth={440}
          narrow="cards"
          rows={ranked}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

function ClassTable({ rows }: { rows: MeritStats["classes"] }) {
  if (rows.length === 0) {
    return <EmptyState>배정된 반이 없습니다.</EmptyState>;
  }

  const columns: Column<MeritStats["classes"][number]>[] = [
    {
      key: "class",
      header: "학급",
      width: "w-[120px]",
      card: "title",
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.grade}학년 {row.classNo}반
        </span>
      ),
    },
    {
      key: "students",
      header: "인원",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.students}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[88px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[88px]",
      card: "meta",
      // 반 합계에는 강조를 대지 않는다 — 기준은 학생 한 명에게 정한 값이라
      // 인원이 많은 반은 예외 없이 넘는다. 위험한 학생은 「기준 초과 학생」이 짚는다.
      cell: (row) => <span className="text-rose">{row.demerit}</span>,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => (
        <span className={`font-medium ${row.offset === 0 ? "text-mut2" : "text-green"}`}>
          {row.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: "순점수",
      width: "w-[92px]",
      card: "trailing",
      cell: (row) => (
        <span className={`font-medium ${row.net >= 0 ? "text-green" : "text-rose"}`}>
          {signedNet(row.net)}
        </span>
      ),
    },
    {
      key: "avgNet",
      header: "1인 평균",
      card: "meta",
      cell: (row) => <span className="text-mut">{signedNet(row.avgNet)}</span>,
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="반별 현황"
    >
      <DataTable
        minWidth={520}
        narrow="cards"
        rows={rows}
        rowKey={(row) => `${row.grade}-${row.classNo}`}
        columns={columns}
      />
    </SectionCard>
  );
}

function TopRules({ rows }: { rows: MeritStats["topRules"] }) {
  if (rows.length === 0) {
    return <EmptyState>부여된 상벌점이 없습니다.</EmptyState>;
  }

  const columns: Column<MeritStats["topRules"][number]>[] = [
    {
      key: "kind",
      header: "구분",
      width: "w-[68px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => <KindBadge kind={row.kind} />,
    },
    {
      key: "label",
      header: "항목",
      card: "title",
      cell: (row) => <span className="text-ink">{row.label}</span>,
    },
    {
      key: "count",
      header: "건수",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-ink">{row.count}</span>,
    },
    {
      key: "points",
      header: "합계 점수",
      width: "w-[88px]",
      card: "trailing",
      cell: (row) => (
        <span className={`font-medium ${kindColorClass(row.kind)}`}>
          {signedPoints(row.kind, row.points)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard flush headingLevel={3} title="많이 나온 항목" hint={`상위 ${rows.length}개`}>
      <DataTable
        minWidth={480}
        narrow="cards"
        rows={rows}
        rowKey={(row) => `${row.kind}-${row.label}`}
        columns={columns}
      />
    </SectionCard>
  );
}

/** searchParams의 숫자 하나. 범위 밖이거나 숫자가 아니면 null(=조건 없음)이다. */
function numberParam(
  value: string | string[] | undefined,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}
