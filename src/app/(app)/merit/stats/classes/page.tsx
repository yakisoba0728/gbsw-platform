import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getMeritStats, type MeritStats } from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "반·학생별 통계" };

/** 여러 곳에서 쓰는 숫자 쿼리 읽기 — 범위 밖이면 없는 것으로 친다. */
function numberParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export default async function ClassStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year) ? Number(raw.year) : undefined;

  const grade = numberParam(raw.grade, 1, 3);
  const classNo = numberParam(raw.classNo, 1, 20);
  const scope = grade !== null && classNo !== null ? { grade, classNo } : undefined;

  let stats: MeritStats | null = null;
  try {
    stats = await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h2 className="text-title font-semibold text-ink">반·학생별 통계</h2>

      <TrackTabs
        current={track}
        hrefFor={(t) => hrefWith("/merit/stats/classes", raw, { track: t })}
      />

      {!stats ? (
        <NoAcademicYearNotice />
      ) : (
        <SectionCard flush title="반별 현황" hint={`${stats.classes.length}개 반`}>
          <ul className="divide-y divide-line2">
            {stats.classes.map((c) => (
              <li key={`${c.grade}-${c.classNo}`} className="px-5 py-3">
                {c.grade}학년 {c.classNo}반 · 순점수 {c.net}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
