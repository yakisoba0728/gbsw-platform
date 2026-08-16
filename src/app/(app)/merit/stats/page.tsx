import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getMeritStats, type MeritStats } from "@/modules/merit/award.service";

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

  let stats: MeritStats | null = null;
  try {
    stats = await getMeritStats(actor, track, year);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={`/merit/stats?track=${t}`}
            className={
              t === track
                ? "rounded-full bg-pri px-4 py-2 text-[13px] font-bold text-white"
                : "rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-mut hover:border-pri hover:text-pri"
            }
          >
            {MERIT_TRACK_LABELS[t]}
          </Link>
        ))}
      </div>

      {!stats ? (
        <NoAcademicYearNotice />
      ) : (
        <>
          <p className="text-[13px] text-mut">
            {isYearScoped(track)
              ? `${stats.year}학년도 집계 · 반 편성 ${stats.rosterYear}학년도`
              : `입학부터 전체 누적 · 반 편성 ${stats.rosterYear}학년도`}
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="상점" value={stats.totals.merit} className="text-blue" />
            <Stat label="벌점" value={stats.totals.demerit} className="text-rose" />
            <Stat label="상쇄점" value={stats.totals.offset} className="text-green" />
            <Stat
              label="순점수"
              value={stats.totals.net}
              signed
              className={stats.totals.net >= 0 ? "text-green" : "text-rose"}
            />
            <Stat
              label="부여 건수"
              value={stats.totals.awardCount}
              className="text-ink"
            />
          </div>

          <ClassTable rows={stats.classes} />
          <TopRules rows={stats.topRules} />
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  signed,
  className,
}: {
  label: string;
  value: number;
  signed?: boolean;
  className: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="text-[12px] font-semibold text-mut">{label}</div>
      <div className={`mt-1 text-[24px] font-extrabold ${className}`}>
        {signed && value >= 0 ? "+" : ""}
        {value}
      </div>
    </div>
  );
}

function ClassTable({ rows }: { rows: MeritStats["classes"] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
        배정된 반이 없습니다. 학생 관리에서 명단을 먼저 반영해 주세요.
      </div>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">반별 현황</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[72px]" />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[80px]" />
            <col className="w-[92px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-line2 text-[12px] text-mut">
              <th className="px-5 py-2.5 font-semibold">학급</th>
              <th className="px-3 py-2.5 font-semibold">인원</th>
              <th className="px-3 py-2.5 font-semibold">상점</th>
              <th className="px-3 py-2.5 font-semibold">벌점</th>
              <th className="px-3 py-2.5 font-semibold">상쇄</th>
              <th className="px-3 py-2.5 font-semibold">순점수</th>
              <th className="px-5 py-2.5 font-semibold">1인 평균</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.grade}-${row.classNo}`}
                className="border-b border-line2 last:border-0"
              >
                <td className="px-5 py-2.5 font-semibold text-ink">
                  {row.grade}학년 {row.classNo}반
                </td>
                <td className="px-3 py-2.5 text-mut">{row.students}</td>
                <td className="px-3 py-2.5 font-bold text-blue">{row.merit}</td>
                <td className="px-3 py-2.5 font-bold text-rose">{row.demerit}</td>
                <td
                  className={`px-3 py-2.5 font-bold ${row.offset === 0 ? "text-mut2" : "text-green"}`}
                >
                  {row.offset}
                </td>
                <td
                  className={`px-3 py-2.5 font-bold ${row.net >= 0 ? "text-green" : "text-rose"}`}
                >
                  {row.net >= 0 ? "+" : ""}
                  {row.net}
                </td>
                <td className="px-5 py-2.5 text-mut">
                  {row.avgNet >= 0 ? "+" : ""}
                  {row.avgNet}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TopRules({ rows }: { rows: MeritStats["topRules"] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center text-[12.5px] text-mut">
        아직 부여된 상벌점이 없습니다.
      </div>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">많이 나온 항목</h2>
        <p className="mt-1 text-[12px] text-mut">
          어떤 규정이 실제로 쓰이는지 보여줍니다. 상위 {rows.length}개.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <colgroup>
            <col className="w-[68px]" />
            <col />
            <col className="w-[80px]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line2 text-[12px] text-mut">
              <th className="px-5 py-2.5 font-semibold">구분</th>
              <th className="px-3 py-2.5 font-semibold">항목</th>
              <th className="px-3 py-2.5 font-semibold">건수</th>
              <th className="px-5 py-2.5 font-semibold">합계 점수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.kind}-${row.label}`}
                className="border-b border-line2 last:border-0"
              >
                <td className="px-5 py-2.5">
                  <KindBadge kind={row.kind} />
                </td>
                <td className="px-3 py-2.5 text-ink">{row.label}</td>
                <td className="px-3 py-2.5 font-bold text-ink">{row.count}</td>
                <td
                  className={`px-5 py-2.5 font-bold ${kindColorClass(row.kind)}`}
                >
                  {signedPoints(row.kind, row.points)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
