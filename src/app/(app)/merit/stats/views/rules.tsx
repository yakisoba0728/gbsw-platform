import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import type { MeritTrack } from "@/core/authz/merit-track";
import { ChevronDownIcon } from "@/components/icons";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { SkeletonStats, SkeletonTable } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getRuleStats, type RuleStats } from "@/modules/merit/stats.service";
import { RuleCategoryCard } from "./rule-groups";

export type RulesPromise = Promise<RuleStats | null>;

export async function loadRules(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
): RulesPromise {
  try {
    return await getRuleStats(actor, track, year);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

export async function RulesHint({ promise }: { promise: RulesPromise }) {
  const stats = await promise;
  if (!stats) return null;

  return <>{stats.year === null ? "입학부터 전체 누적" : `${stats.year}학년도 집계`}</>;
}

export async function RulesBody({
  promise,
  track,
}: {
  promise: RulesPromise;
  track: MeritTrack;
}) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  return (
    <>
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

      <UnusedRules stats={stats} track={track} />
    </>
  );
}

export function RulesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />

      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

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
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-caption font-medium text-ink outline-none hover:bg-soft focus-visible:ring-2 focus-visible:ring-ink [&::-webkit-details-marker]:hidden">
            <ChevronDownIcon
              size={16}
              className="shrink-0 text-mut transition-transform group-open:rotate-180"
            />
            목록 펼치기
            <span className="text-mut">{rows.length}개</span>
          </summary>
          <DataTable
            minWidth={480}
            narrow="cards"
            rows={rows}
            rowKey={(row) => row.id}
            columns={columns}
          />
        </details>
      )}
    </SectionCard>
  );
}
