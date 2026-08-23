import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
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

  let stats: RuleStats | null = null;
  try {
    stats = await getRuleStats(actor, track, year);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="규정별 통계"
        hint={
          stats
            ? stats.year === null
              ? "입학부터 전체 누적"
              : `${stats.year}학년도 집계`
            : undefined
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => hrefWith("/merit/stats/rules", raw, { track: t })}
            size="sm"
          />
        }
      />

      {!stats ? (
        <NoAcademicYearNotice />
      ) : (
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
      )}
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
