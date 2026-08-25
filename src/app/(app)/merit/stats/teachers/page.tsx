import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission, type SessionUser } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
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
import { getTeacherStats, type TeacherStats } from "@/modules/merit/stats.service";
import { TeacherChart } from "./teacher-chart";

export const metadata: Metadata = { title: "교사별 통계" };

/** 표와 그래프가 함께 쓰는 한 줄. 비중은 화면에서만 계산한다. */
type Row = TeacherStats["rows"][number] & { key: string; share: string };

export default async function TeacherStatsPage({
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

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 트랙 탭까지
  // 뼈대로 덮인다 — 방금 고른 조건이 사라지는 그 증상이다.
  // 두 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const statsPromise = loadStats(actor, track, year);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 옛 내용을 그대로 보여준다 — key가 없으면 탭을 눌러도 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({ track, year });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="교사별 통계"
        hint={
          // 집계 범위는 데이터에서 나온다 — 본문과 같은 약속을 나눠 기다린다.
          <Suspense key={boundaryKey} fallback={<HintSkeleton />}>
            <RangeHint promise={statsPromise} track={track} />
          </Suspense>
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => hrefWith("/merit/stats/teachers", raw, { track: t })}
            size="sm"
          />
        }
      />

      {/* 합계·그래프·표가 전부 같은 조회에서 나온다 — 경계를 하나로 둬야 한꺼번에 들어온다. */}
      <Suspense key={boundaryKey} fallback={<TeacherSkeleton />}>
        <TeacherBody promise={statsPromise} />
      </Suspense>
    </div>
  );
}

type StatsPromise = Promise<TeacherStats | null>;

/**
 * 현재 학년도가 없으면 안내로 바꾼다. 페이지에서 try/catch로 잡으면 거기서 기다리게 되고,
 * 경계 밖에서 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 */
async function loadStats(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
): StatsPromise {
  try {
    return await getTeacherStats(actor, track, year);
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

  return <>{isYearScoped(track) ? `${stats.year}학년도 집계` : "입학부터 전체 누적"}</>;
}

/** 집계에서 나오는 것 전부. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function TeacherBody({ promise }: { promise: StatsPromise }) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  const totals = sumRows(stats.rows);
  const rows: Row[] = stats.rows.map((row) => ({
    ...row,
    // 서비스가 계정 있는 사람과 이름만 남은 사람을 가르는 방식을 그대로 쓴다.
    key: row.userId ? `u:${row.userId}` : `n:${row.name}`,
    share: sharePercent(row.awardCount, totals.awardCount),
  }));

  if (rows.length === 0) {
    return <EmptyState>부여된 상벌점이 없습니다.</EmptyState>;
  }

  return (
    <>
      {/* 뷰포트가 아니라 놓인 자리의 폭을 본다 — 통계 개요와 같은 기준이다. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5">
          <StatTile label="부여자" value={`${stats.teacherCount}명`} />
          <StatTile label="부여 건수" value={totals.awardCount} />
          <StatTile label="상점" value={totals.merit} valueClassName="text-blue" />
          <StatTile label="벌점" value={totals.demerit} valueClassName="text-rose" />
          <StatTile label="상쇄점" value={totals.offset} valueClassName="text-green" />
        </div>
      </div>

      <TeacherChart rows={rows} />
      <TeacherTable rows={rows} />
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
 * 합계 칸 · 막대 그래프 · 표 자리. 개수를 화면과 맞춘다 — 어긋나면 집계가 도착할 때
 * 자리가 통째로 다시 짜인다. 바깥과 같은 space-y-4라 간격도 그대로다.
 */
function TeacherSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={5} />
      <Skeleton className="h-[236px]" />
      <SkeletonTable rows={8} />

      {/* 맨 뒤에 둔다 — 앞에 두면 space-y가 첫 칸을 16px 밀어 내린다. */}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

function TeacherTable({ rows }: { rows: Row[] }) {
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "부여자",
      card: "title",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{row.name}</span>
          {/* 계정이 사라져도 부여 기록은 남는다 — 이름만 남았다는 사실을 적는다. */}
          {row.removed && <Badge tone="cancelled">삭제된 계정</Badge>}
        </span>
      ),
    },
    {
      key: "awardCount",
      header: "건수",
      width: "w-[84px]",
      sort: "descending",
      card: "trailing",
      // 카드 모드에는 머리글이 없다 — 단위를 붙여야 점수와 헷갈리지 않는다.
      cell: (row) => <span className="font-medium text-ink">{row.awardCount}건</span>,
    },
    {
      key: "share",
      header: "비중",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.share}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.totals.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-rose">{row.totals.demerit}</span>,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.totals.offset === 0 ? "text-mut2" : "text-green"}`}
        >
          {row.totals.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: "순점수",
      width: "w-[88px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.totals.net >= 0 ? "text-green" : "text-rose"}`}
        >
          {signedNet(row.totals.net)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="부여자별 합계"
      hint="비중은 전체 부여 건수에서 차지하는 몫입니다."
    >
      <DataTable
        minWidth={640}
        narrow="cards"
        rows={rows}
        rowKey={(row) => row.key}
        columns={columns}
      />
    </SectionCard>
  );
}

/** 전체 합계 — 비중의 분모이자 머리글 숫자다. */
function sumRows(rows: TeacherStats["rows"]) {
  return rows.reduce(
    (sum, row) => ({
      merit: sum.merit + row.totals.merit,
      demerit: sum.demerit + row.totals.demerit,
      offset: sum.offset + row.totals.offset,
      awardCount: sum.awardCount + row.awardCount,
    }),
    { merit: 0, demerit: 0, offset: 0, awardCount: 0 },
  );
}

/** `32%` · `2.4%`. 10% 미만은 소수 한 자리까지 적는다 — 반올림하면 전부 0%가 된다. */
function sharePercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const pct = (part / whole) * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}
