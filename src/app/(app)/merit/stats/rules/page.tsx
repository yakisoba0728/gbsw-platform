import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission, type SessionUser } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { SkeletonStats, SkeletonTable } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getRuleStats, type RuleStats } from "@/modules/merit/stats.service";
import { RuleCategoryCard } from "./rule-groups";

export const metadata: Metadata = { title: "규정별 통계" };

export default async function RuleStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  // 링크가 year를 실어 나르므로 여기서도 읽는다 — 안 읽으면 주소와 집계가 어긋난다.
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
        title="규정별 통계"
        hint={
          // 집계 범위는 데이터에서 나온다 — 본문과 같은 약속을 나눠 기다린다.
          <Suspense key={boundaryKey} fallback={<HintSkeleton />}>
            <RangeHint promise={statsPromise} />
          </Suspense>
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => hrefWith("/merit/stats/rules", raw, { track: t })}
            size="sm"
          />
        }
      />

      {/* 합계 칸과 두 표가 전부 같은 조회에서 나온다 — 경계를 하나로 둬야 한꺼번에 들어온다. */}
      <Suspense key={boundaryKey} fallback={<RuleSkeleton />}>
        <RuleBody promise={statsPromise} track={track} />
      </Suspense>
    </div>
  );
}

type StatsPromise = Promise<RuleStats | null>;

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
    return await getRuleStats(actor, track, year);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

/** 집계 범위 한 줄. 본문과 같은 약속을 기다리므로 질의가 늘지 않는다. */
async function RangeHint({ promise }: { promise: StatsPromise }) {
  const stats = await promise;
  if (!stats) return null;

  return <>{stats.year === null ? "입학부터 전체 누적" : `${stats.year}학년도 집계`}</>;
}

/** 집계에서 나오는 것 전부. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function RuleBody({
  promise,
  track,
}: {
  promise: StatsPromise;
  track: MeritTrack;
}) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  return (
    <>
      {/* 뷰포트가 아니라 놓인 자리의 폭을 본다. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
          <StatTile label="부여 건수" value={stats.totalCount} />
          <StatTile label="쓰인 규정" value={stats.rows.length} />
          <StatTile label="안 쓰인 규정" value={stats.unused.length} />
          <StatTile
            label="삭제된 규정"
            value={stats.rows.filter((row) => row.deleted).length}
          />
        </div>
      </div>

      <RuleCategoryCard stats={stats} />

      {/* 부여가 0건이어도 낸다 — 그때는 모든 규정이 안 쓰인 규정이다. */}
      <UnusedRules stats={stats} track={track} />
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
 * 합계 칸 · 분류별 부여 · 안 쓰인 규정 자리. 개수를 화면과 맞춘다 — 어긋나면 집계가
 * 도착할 때 자리가 통째로 다시 짜인다. 바깥과 같은 space-y-4라 간격도 그대로다.
 */
function RuleSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />

      {/* 맨 뒤에 둔다 — 앞에 두면 space-y가 첫 칸을 16px 밀어 내린다. */}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 이 화면만 가진 자료. 안 쓰는 항목이 부여 목록을 길게 만든다. */
function UnusedRules({ stats, track }: { stats: RuleStats; track: MeritTrack }) {
  const rows = [...stats.unused].sort(
    (a, b) =>
      Number(a.category === null) - Number(b.category === null) ||
      (a.category ?? "").localeCompare(b.category ?? "", "ko") ||
      a.label.localeCompare(b.label, "ko"),
  );

  const columns: Column<(typeof rows)[number]>[] = [
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
      key: "category",
      header: "분류",
      width: "w-[160px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => <span className="text-mut">{row.category ?? "분류 없음"}</span>,
    },
    {
      key: "points",
      header: "점수",
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
    <SectionCard
      flush
      headingLevel={3}
      title="안 쓰인 규정"
      // 범위를 적는다 — 교내는 학년도별 집계라 "한 번도"가 아니다.
      hint={
        stats.year === null
          ? `부여 기록이 없는 규정 ${rows.length}개입니다.`
          : `${stats.year}학년도에 부여 기록이 없는 규정 ${rows.length}개입니다.`
      }
      aside={
        <Link
          href={`/admin/merit/rules?track=${track}`}
          className="text-sm text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          규정 관리
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">안 쓰인 규정이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={480}
          narrow="cards"
          rows={rows}
          rowKey={(row) => row.id}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}
