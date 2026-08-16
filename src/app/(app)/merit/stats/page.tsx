import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { TrackTabs } from "@/components/merit/track-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { TableFrame } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { demeritCellClass, ThresholdHint } from "@/components/merit/demerit-level";
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

  let stats: MeritStats | null = null;
  try {
    stats = await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  /** 지금 쿼리를 유지한 채 일부만 바꾼 주소. 트랙 탭과 반 선택이 함께 쓴다. */
  function statsHref(patch: Record<string, string | null>): string {
    return hrefWith("/merit/stats", raw, patch);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <TrackTabs current={track} hrefFor={(t) => statsHref({ track: t })} />

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
                {/* ✕는 "누르면 이 필터가 풀린다"는 장식이다 — 링크 이름에 넣지 않는다. */}
                <Link
                  href={statsHref({ grade: null, classNo: null })}
                  className="text-pri hover:underline"
                >
                  전교 보기 <span aria-hidden>✕</span>
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
        {signed ? signedNet(value) : value}
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
    <SectionCard
      flush
      title="기준 초과 학생"
      /*
        기준 숫자를 그대로 적는다. DEMERIT_THRESHOLDS는 학교가 정할 값의
        임시값이라, 화면에 안 보이면 틀린 값으로 몇 학기가 지나갈 수 있다.
      */
      hint={
        <>
          {where}에서 벌점 {thresholds.warn}점 이상인 학생입니다 (
          {thresholds.danger}점 이상은 붉은 배경). 상점·상쇄점과 무관하게 벌점
          총합만 셉니다.
        </>
      }
      // 둘째 문단은 controls로 넘긴다 — hint는 <p> 하나라 안에 문단을 또 넣을 수 없다.
      controls={
        <p className="mt-1 text-[12px] text-mut">
          <strong className="font-bold">보여주기만 합니다</strong> — 기준을 넘어도
          자동으로 회부·통보되는 것은 없습니다. 기준 점수는 학칙·기숙사 규정에
          맞춰 정해야 하는 임시값입니다.
        </p>
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">
          {where}에 벌점 {thresholds.warn}점 이상인 학생이 없습니다.
        </EmptyState>
      ) : (
        <TableFrame
          minWidth={440}
          cols={["w-[48px]", undefined, "w-[132px]", "w-[84px]"]}
          headers={["#", "이름", "학급", "벌점"]}
        >
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
        </TableFrame>
      )}
    </SectionCard>
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
      <EmptyState>
        배정된 반이 없습니다. 학생 관리에서 명단을 먼저 반영해 주세요.
      </EmptyState>
    );
  }

  return (
    <SectionCard
      flush
      title="반별 현황"
      // ThresholdHint가 <p>라 hint(역시 <p>)에는 넣을 수 없다.
      controls={
        <div className="mt-1">
          <ThresholdHint track={track} />
        </div>
      }
    >
      <TableFrame
        minWidth={520}
        cols={[
          "w-[120px]",
          "w-[72px]",
          "w-[88px]",
          "w-[88px]",
          "w-[80px]",
          "w-[92px]",
          undefined,
        ]}
        headers={["학급", "인원", "상점", "벌점", "상쇄", "순점수", "1인 평균"]}
      >
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
                {signedNet(row.net)}
              </td>
              <td className="px-5 py-2.5 text-mut">{signedNet(row.avgNet)}</td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </SectionCard>
  );
}

function TopRules({ rows }: { rows: MeritStats["topRules"] }) {
  if (rows.length === 0) {
    return <EmptyState>아직 부여된 상벌점이 없습니다.</EmptyState>;
  }

  return (
    <SectionCard flush title="많이 나온 항목" hint={`상위 ${rows.length}개`}>
      <TableFrame
        minWidth={480}
        cols={["w-[68px]", undefined, "w-[80px]", "w-[88px]"]}
        headers={["구분", "항목", "건수", "합계 점수"]}
      >
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
              <td className={`px-5 py-2.5 font-bold ${kindColorClass(row.kind)}`}>
                {signedPoints(row.kind, row.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </TableFrame>
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
