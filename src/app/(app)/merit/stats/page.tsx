import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { demeritCellClass, ThresholdHint } from "@/components/merit/demerit-level";
import {
  CategoryChart,
  ClassNetChart,
  MonthlyChart,
  StudentNetChart,
} from "@/components/merit/charts";
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

  // 반을 골랐으면 그 반만 본다. 둘 다 유효할 때만 적용한다 —
  // 하나만 있는 중간 상태는 전교로 떨어진다.
  const grade = numberParam(raw.grade, 1, 3);
  const classNo = numberParam(raw.classNo, 1, 20);
  const scope = grade !== null && classNo !== null ? { grade, classNo } : undefined;

  let stats: MeritStats | null = null;
  try {
    stats = await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  /** 지금 쿼리를 유지한 채 일부만 바꾼 주소. 트랙 탭과 반 선택이 함께 쓴다. */
  function hrefWith(patch: Record<string, string | null>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") query.set(key, value);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `/merit/stats?${qs}` : "/merit/stats";
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        {MERIT_TRACKS.map((t) => (
          <Link
            key={t}
            href={hrefWith({ track: t })}
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] text-mut">
              {isYearScoped(track)
                ? `${stats.year}학년도 집계 · 반 편성 ${stats.rosterYear}학년도`
                : `입학부터 전체 누적 · 반 편성 ${stats.rosterYear}학년도`}
            </p>
            {stats.scope && (
              <span className="flex items-center gap-2 rounded-full bg-pri-soft px-3 py-1 text-[12.5px] font-bold text-pri">
                {stats.scope.grade}학년 {stats.scope.classNo}반만 보는 중
                <Link
                  href={hrefWith({ grade: null, classNo: null })}
                  className="text-pri hover:underline"
                >
                  전교 보기 ✕
                </Link>
              </span>
            )}
          </div>

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

          <MonthlyChart points={stats.monthly} axisLabel={stats.axisLabel} />

          {stats.scope && stats.students ? (
            <StudentNetChart
              rows={stats.students}
              track={track}
              hrefFor={(id) => `/merit/students/${id}?track=${track}`}
            />
          ) : (
            <ClassNetChart
              rows={stats.classes}
              track={track}
              hrefFor={(row) =>
                hrefWith({ grade: String(row.grade), classNo: String(row.classNo) })
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

          <ClassTable rows={stats.classes} track={track} />
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

/**
 * 기준 초과 학생 명단.
 *
 * 반별 표의 강조는 "그 반 안에서 누가 높은가"까지만 답한다. 선도위원회를 준비할
 * 때 필요한 것은 **전교에서 선을 넘은 사람 전부**이고, 그러려면 지금까지는 반
 * 명단을 하나씩 열어 봐야 했다.
 *
 * **표시만 한다.** 여기서 회부·통보·상태 변경이 일어나지 않는다 — 불이익을 주는
 * 판단은 사람이 하고, 화면은 눈에 띄게 해줄 뿐이다.
 */
function WatchList({
  rows,
  track,
  thresholds,
  scoped,
}: {
  rows: MeritStats["watchList"];
  track: MeritTrack;
  thresholds: { warn: number; danger: number };
  /** 반을 골라 보는 중인가. 명단의 범위를 문구에 적는다. */
  scoped: boolean;
}) {
  const where = scoped ? "이 반" : "전교";

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">기준 초과 학생</h2>
        {/*
          기준 숫자를 그대로 적는다. DEMERIT_THRESHOLDS는 학교가 정할 값의
          임시값이라, 화면에 안 보이면 틀린 값으로 몇 학기가 지나갈 수 있다.
        */}
        <p className="mt-1 text-[12px] text-mut">
          {where}에서 벌점 {thresholds.warn}점 이상인 학생입니다 (
          {thresholds.danger}점 이상은 붉은 배경). 상점·상쇄점과 무관하게 벌점
          총합만 셉니다.
        </p>
        <p className="mt-1 text-[12px] text-mut">
          <strong className="font-bold">보여주기만 합니다</strong> — 기준을 넘어도
          자동으로 회부·통보되는 것은 없습니다. 기준 점수는 학칙·기숙사 규정에
          맞춰 정해야 하는 임시값입니다.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-[12.5px] text-mut">
          {where}에 벌점 {thresholds.warn}점 이상인 학생이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <colgroup>
              <col className="w-[48px]" />
              <col />
              <col className="w-[132px]" />
              <col className="w-[84px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line2 text-[12px] text-mut">
                <th className="px-5 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">이름</th>
                <th className="px-3 py-2.5 font-semibold">학급</th>
                <th className="px-5 py-2.5 font-semibold">벌점</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.studentProfileId}
                  className="border-b border-line2 last:border-0"
                >
                  <td className="px-5 py-2.5 text-mut2">{index + 1}</td>
                  <td className="p-0">
                    <Link
                      href={`/merit/students/${row.studentProfileId}?track=${track}`}
                      className="block px-3 py-2.5 font-semibold text-ink hover:text-pri hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-mut">
                    {/*
                      소속이 없어도 명단에서 빼지 않는다 — 반 미배정·학적 변동 중인
                      학생이야말로 눈에서 놓치기 쉬운 쪽이다.
                    */}
                    {row.grade !== null && row.classNo !== null
                      ? `${row.grade}학년 ${row.classNo}반${row.number !== null ? ` ${row.number}번` : ""}`
                      : "소속 미배정"}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={demeritCellClass(track, row.demerit)}>
                      {row.demerit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClassTable({
  rows,
  track,
}: {
  rows: MeritStats["classes"];
  track: MeritTrack;
}) {
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
        <div className="mt-1">
          <ThresholdHint track={track} />
        </div>
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
                <td className="px-3 py-2.5">
                  <span className={demeritCellClass(track, row.demerit)}>
                    {row.demerit}
                  </span>
                </td>
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
