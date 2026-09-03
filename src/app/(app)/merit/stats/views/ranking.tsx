import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { signedNet } from "@/modules/merit/merit.points";
import { DemeritCell } from "@/components/merit/demerit-level";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { formatSeat } from "@/lib/student-number";
import { honorificName } from "@/core/authz/roles";
import {
  getRankingStats,
  type RankedStudent,
  type RankingStats,
} from "@/modules/merit/stats.service";

type Patch = Record<string, string | null>;

export type RankingPromise = Promise<RankingStats | null>;

export async function loadRanking(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
  scope: { grade: number; classNo: number } | undefined,
): RankingPromise {
  try {
    return await getRankingStats(actor, track, year, scope);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

export async function RankingHint({
  promise,
  track,
}: {
  promise: RankingPromise;
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

export async function RankingBody({
  promise,
  track,
  href,
}: {
  promise: RankingPromise;
  track: MeritTrack;
  href: (patch: Patch) => string;
}) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  return stats.scope ? (
    <ClassRosterCard stats={stats} track={track} />
  ) : (
    <>
      <StudentRankCard stats={stats} track={track} />
      <ClassRankCard stats={stats} href={href} />
    </>
  );
}

export function RankingSkeleton({ scoped }: { scoped: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonTable rows={scoped ? 8 : 10} />
      {!scoped && <SkeletonTable rows={6} />}

      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

function StudentLink({ row, track }: { row: RankedStudent; track: MeritTrack }) {
  return (
    <Link
      href={`/students/${row.studentProfileId}?track=${track}`}
      className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
    >
      {honorificName(row.name, "STUDENT")}
    </Link>
  );
}

function netCell(row: RankedStudent | { net: number }) {
  return (
    <span className={row.net >= 0 ? "text-green" : "text-rose"}>{signedNet(row.net)}</span>
  );
}

function classLabel(row: RankedStudent): string {
  return formatSeat(row) ?? "반 미배정";
}

function StudentRankCard({
  stats,
  track,
}: {
  stats: RankingStats;
  track: MeritTrack;
}) {
  const columns: Column<RankedStudent>[] = [
    {
      key: "rank",
      header: "등수",
      width: "w-[64px]",
      card: "trailing",
      cell: (row) => <span className="tabular-nums text-mut">{row.rank}</span>,
    },
    {
      key: "name",
      header: "이름",
      width: "w-[120px]",
      card: "title",
      cell: (row) => <StudentLink row={row} track={track} />,
    },
    {
      key: "class",
      header: "소속",
      card: "meta",
      cardLabel: false,
      cell: (row) => <span className="text-mut">{classLabel(row)}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => <span className="text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[86px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={stats.thresholds} demerit={row.demerit} />,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.offset}</span>,
    },
    {
      key: "net",
      sort: "descending",
      header: "순점수",
      width: "w-[84px]",
      card: "meta",
      cell: (row) => netCell(row),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="학생 순위"
      hint="순점수 높은 순 · 동점은 같은 등수"
      aside={<span className="text-xs text-mut">{stats.students.length}명</span>}
    >
      {stats.students.length === 0 ? (
        <EmptyState variant="inside">재학 중인 학생이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={660}
          narrow="cards"
          rows={stats.students}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

function ClassRankCard({
  stats,
  href,
}: {
  stats: RankingStats;
  href: (patch: Patch) => string;
}) {
  type Row = RankingStats["classes"][number];

  const columns: Column<Row>[] = [
    {
      key: "rank",
      header: "등수",
      width: "w-[64px]",
      card: "trailing",
      cell: (row) => <span className="tabular-nums text-mut">{row.rank}</span>,
    },
    {
      key: "class",
      header: "학급",
      width: "w-[132px]",
      card: "title",
      cell: (row) => (
        <Link
          href={href({ grade: String(row.grade), classNo: String(row.classNo) })}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {row.grade}학년 {row.classNo}반
        </Link>
      ),
    },
    {
      key: "students",
      header: "인원",
      width: "w-[68px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.students}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[76px]",
      card: "meta",
      cell: (row) => <span className="text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[76px]",
      card: "meta",
      cell: (row) => <span className="text-rose">{row.demerit}</span>,
    },
    {
      key: "avgNet",
      sort: "descending",
      header: "1인 평균",
      width: "w-[92px]",
      card: "meta",
      cell: (row) => (
        <span className={row.avgNet >= 0 ? "text-green" : "text-rose"}>
          {signedNet(row.avgNet)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="반 순위"
      hint="1인 평균 순점수 순 · 반을 누르면 그 반 전원이 나옵니다"
      aside={<span className="text-xs text-mut">{stats.classes.length}개 반</span>}
    >
      {stats.classes.length === 0 ? (
        <EmptyState variant="inside">배정된 반이 없습니다.</EmptyState>
      ) : (
        <DataTable
          minWidth={620}
          narrow="cards"
          rows={stats.classes}
          rowKey={(row) => `${row.grade}-${row.classNo}`}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

function ClassRosterCard({
  stats,
  track,
}: {
  stats: RankingStats;
  track: MeritTrack;
}) {
  const columns: Column<RankedStudent>[] = [
    {
      key: "number",
      sort: "ascending",
      header: "번호",
      width: "w-[64px]",
      card: "trailing",
      cell: (row) => <span className="tabular-nums text-mut">{row.number ?? "—"}</span>,
    },
    {
      key: "name",
      header: "이름",
      width: "w-[132px]",
      card: "title",
      cell: (row) => <StudentLink row={row} track={track} />,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[76px]",
      card: "meta",
      cell: (row) => <span className="text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[90px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={stats.thresholds} demerit={row.demerit} />,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[76px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.offset}</span>,
    },
    {
      key: "net",
      header: "순점수",
      width: "w-[84px]",
      card: "meta",
      cell: (row) => netCell(row),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title={`${stats.scope?.grade}학년 ${stats.scope?.classNo}반`}
      hint="번호순 · 전원"
      aside={<span className="text-xs text-mut">{stats.students.length}명</span>}
    >
      {stats.students.length === 0 ? (
        <EmptyState variant="inside">
          {stats.scope?.grade}학년 {stats.scope?.classNo}반에 배정된 학생이 없습니다.
        </EmptyState>
      ) : (
        <DataTable
          minWidth={600}
          narrow="cards"
          rows={stats.students}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}
