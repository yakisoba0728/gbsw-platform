import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getRuleStats, type RuleStats } from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "규정별 통계" };

export default async function RuleStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";

  let stats: RuleStats | null = null;
  try {
    stats = await getRuleStats(actor, track);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h2 className="text-title font-semibold text-ink">규정별 통계</h2>

      <TrackTabs
        current={track}
        hrefFor={(t) => hrefWith("/merit/stats/rules", raw, { track: t })}
      />

      {!stats ? (
        <NoAcademicYearNotice />
      ) : stats.rows.length === 0 ? (
        <EmptyState>부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <SectionCard flush title="규정별 부여" hint={`${stats.totalCount}건`}>
          <ul className="divide-y divide-line2">
            {stats.rows.map((row) => (
              <li key={row.ruleId} className="px-5 py-3">
                {row.label} · {row.count}건 · {row.points}점
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
