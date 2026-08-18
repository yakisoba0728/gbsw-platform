import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getTeacherStats, type TeacherStats } from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "교사별 통계" };

export default async function TeacherStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";

  let stats: TeacherStats | null = null;
  try {
    stats = await getTeacherStats(actor, track);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* h1은 상단바가 그린다 — 여기는 h2고 카드는 h3다. */}
      <h2 className="text-title font-semibold text-ink">교사별 통계</h2>

      <TrackTabs
        current={track}
        hrefFor={(t) => hrefWith("/merit/stats/teachers", raw, { track: t })}
      />

      {!stats ? (
        <NoAcademicYearNotice />
      ) : stats.rows.length === 0 ? (
        <EmptyState>부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <SectionCard flush title="부여자" hint={`${stats.teacherCount}명`}>
          <ul className="divide-y divide-line2">
            {stats.rows.map((row) => (
              <li key={`${row.userId ?? row.name}`} className="px-5 py-3">
                {row.name} · {row.awardCount}건 · 상점 {row.totals.merit} · 벌점{" "}
                {row.totals.demerit}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
