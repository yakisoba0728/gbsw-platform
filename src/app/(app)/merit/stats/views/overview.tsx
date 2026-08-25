import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  signedNet,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonStats, SkeletonTable } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { DemeritCell } from "@/components/merit/demerit-level";
import {
  CategoryChart,
  ClassNetChart,
  MonthlyChart,
  StudentNetChart,
} from "@/components/merit/charts";
import { getMeritStats, type MeritStats } from "@/modules/merit/stats.service";

export type OverviewPromise = Promise<MeritStats | null>;

/**
 * 현재 학년도가 없으면 안내로 바꾼다. 페이지에서 try/catch로 잡으면 거기서 기다리게 되고,
 * 경계 밖에서 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 */
export async function loadOverview(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
  scope: { grade: number; classNo: number } | undefined,
): OverviewPromise {
  try {
    return await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

/** 집계 범위 한 줄. 본문과 같은 약속을 기다리므로 질의가 늘지 않는다. */
export async function OverviewHint({
  promise,
  track,
}: {
  promise: OverviewPromise;
  track: MeritTrack;
}) {
  const stats = await promise;
  if (!stats) return null;

  return (
    <>
      {isYearScoped(track)
        ? `${stats.year}학년도 집계 · 반 편성 ${stats.rosterYear}학년도`
        : `입학부터 전체 누적 · 반 편성 ${stats.rosterYear}학년도`}
    </>
  );
}

/** 집계에서 나오는 것 전부. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
export async function OverviewBody({
  promise,
  track,
  statsHref,
}: {
  promise: OverviewPromise;
  track: MeritTrack;
  statsHref: (patch: Record<string, string | null>) => string;
}) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  return (
    <>
      {/* 뷰포트가 아니라 놓인 자리의 폭을 본다 — MeritTotalsCards와 같은 기준이다. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5">
          <StatTile
            label="상점"
            value={stats.totals.merit}
            valueClassName="text-blue"
          />
          <StatTile
            label="벌점"
            value={stats.totals.demerit}
            valueClassName="text-rose"
          />
          <StatTile
            label="상쇄점"
            value={stats.totals.offset}
            valueClassName="text-green"
          />
          <StatTile
            label="순점수"
            value={signedNet(stats.totals.net)}
            valueClassName={stats.totals.net >= 0 ? "text-green" : "text-rose"}
          />
          <StatTile
            label="부여 건수"
            value={stats.totals.awardCount}
            valueClassName="text-ink"
          />
        </div>
      </div>

      <MonthlyChart points={stats.monthly} axisLabel={stats.axisLabel} />

      {stats.scope && stats.students ? (
        <StudentNetChart
          rows={stats.students}
          thresholds={stats.thresholds}
          hrefFor={(id) => `/merit/students/${id}?track=${track}`}
        />
      ) : (
        <ClassNetChart
          rows={stats.classes}
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

      <ClassTable rows={stats.classes} />
      <TopRules rows={stats.topRules} />
    </>
  );
}

/**
 * 합계·그래프·표 자리. 개수를 화면과 맞춘다 — 어긋나면 집계가 도착할 때 자리가
 * 통째로 다시 짜인다. 바깥과 같은 space-y-4라 간격도 그대로다.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={5} />

      {/* 월별 추이 · 반별(학생별) 순점수 · 분류별 분포 */}
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />

      {/* 표는 셋이다 — 기준 초과 학생 · 반별 현황 · 많이 나온 항목. */}
      <SkeletonTable rows={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />

      {/* 맨 뒤에 둔다 — 앞에 두면 space-y가 첫 칸을 16px 밀어 내린다. */}
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 기준을 넘긴 학생 명단. 표시만 하며 회부·통보는 일어나지 않는다. */
function WatchList({
  rows,
  track,
  thresholds,
  scoped,
}: {
  rows: MeritStats["watchList"];
  track: MeritTrack;
  thresholds: DemeritThresholds;
  /** 반을 골라 보는 중인가. 명단의 범위를 문구에 적는다. */
  scoped: boolean;
}) {
  const where = scoped ? "이 반" : "전교";

  // 순위는 셀 함수가 볼 수 없다(행만 받는다) — 미리 붙여 둔다.
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));

  const columns: Column<(typeof ranked)[number]>[] = [
    {
      key: "rank",
      header: "#",
      width: "w-[48px]",
      cell: (row) => <span className="text-mut2">{row.rank}</span>,
    },
    {
      key: "name",
      header: "이름",
      card: "title",
      cell: (row) => (
        <Link
          href={`/merit/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "class",
      header: "학급",
      width: "w-[132px]",
      card: "meta",
      cardLabel: false,
      cell: (row) => (
        <span className="text-mut">
          {/* 소속이 없어도 명단에서 빼지 않는다 — 반 미배정 학생이 놓치기 쉽다. */}
          {row.grade !== null && row.classNo !== null
            ? `${row.grade}학년 ${row.classNo}반${row.number !== null ? ` ${row.number}번` : ""}`
            : "소속 미배정"}
        </span>
      ),
    },
    {
      key: "demerit",
      header: "벌점",
      // 마지막 열이라 좌우 여백이 px-5다 — 테두리 붙은 세 자리 수가 들어가려면
      // 84px로는 모자란다.
      width: "w-[100px]",
      card: "trailing",
      cell: (row) => <DemeritCell thresholds={thresholds} demerit={row.demerit} />,
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="기준 초과 학생"
      // 기준 숫자를 적는다 — 교사가 설정에서 바꾸는 값이라 안 보이면 명단 길이가 설명되지 않는다.
      hint={
        <>
          {where}에서 벌점 {thresholds.warn}점 이상인 학생입니다. 벌점 총합 기준이며,
          회부·통보는 일어나지 않습니다.
        </>
      }
      // 둘째 문단은 controls로 넘긴다 — hint는 <p> 하나라 안에 문단을 또 넣을 수 없다.
      controls={
        <p className="mt-1 text-xs text-mut">
          기준 점수는{" "}
          <Link
            href="/admin/settings"
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            설정
          </Link>
          에서 바꿉니다.
        </p>
      }
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">
          {where}에 벌점 {thresholds.warn}점 이상인 학생이 없습니다.
        </EmptyState>
      ) : (
        <DataTable
          minWidth={440}
          narrow="cards"
          rows={ranked}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

function ClassTable({ rows }: { rows: MeritStats["classes"] }) {
  const columns: Column<MeritStats["classes"][number]>[] = [
    {
      key: "class",
      header: "학급",
      width: "w-[120px]",
      card: "title",
      cell: (row) => (
        <span className="font-medium text-ink">
          {row.grade}학년 {row.classNo}반
        </span>
      ),
    },
    {
      key: "students",
      header: "인원",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.students}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[88px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[88px]",
      card: "meta",
      // 반 합계에는 강조를 대지 않는다 — 기준은 학생 한 명에게 정한 값이라
      // 인원이 많은 반은 예외 없이 넘는다. 위험한 학생은 「기준 초과 학생」이 짚는다.
      cell: (row) => <span className="text-rose">{row.demerit}</span>,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => (
        <span className={`font-medium ${row.offset === 0 ? "text-mut2" : "text-green"}`}>
          {row.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: "순점수",
      width: "w-[92px]",
      card: "trailing",
      cell: (row) => (
        <span className={`font-medium ${row.net >= 0 ? "text-green" : "text-rose"}`}>
          {signedNet(row.net)}
        </span>
      ),
    },
    {
      key: "avgNet",
      header: "1인 평균",
      card: "meta",
      cell: (row) => <span className="text-mut">{signedNet(row.avgNet)}</span>,
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="반별 현황"
    >
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
      {rows.length === 0 ? (
        <EmptyState variant="inside">배정된 반이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={520}
          narrow="cards"
          rows={rows}
          rowKey={(row) => `${row.grade}-${row.classNo}`}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

function TopRules({ rows }: { rows: MeritStats["topRules"] }) {
  const columns: Column<MeritStats["topRules"][number]>[] = [
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
      key: "count",
      header: "건수",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-ink">{row.count}</span>,
    },
    {
      key: "points",
      header: "합계 점수",
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
      title="많이 나온 항목"
      hint={rows.length === 0 ? undefined : `상위 ${rows.length}개`}
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={480}
          narrow="cards"
          rows={rows}
          rowKey={(row) => `${row.kind}-${row.label}`}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

