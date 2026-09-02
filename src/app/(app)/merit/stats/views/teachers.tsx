import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonStats, SkeletonTable } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getTeacherStats, type TeacherStats } from "@/modules/merit/stats.service";
import { honorificName } from "@/core/authz/roles";
import { TeacherChart } from "./teacher-chart";

type Row = TeacherStats["rows"][number] & { key: string; share: string };

export type TeachersPromise = Promise<TeacherStats | null>;

export async function loadTeachers(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
): TeachersPromise {
  try {
    return await getTeacherStats(actor, track, year);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

export async function TeachersHint({
  promise,
  track,
}: {
  promise: TeachersPromise;
  track: MeritTrack;
}) {
  const stats = await promise;
  if (!stats) return null;

  return <>{isYearScoped(track) ? `${stats.year}학년도 집계` : "입학부터 전체 누적"}</>;
}

export async function TeachersBody({ promise }: { promise: TeachersPromise }) {
  const stats = await promise;
  if (!stats) return <NoAcademicYearNotice />;

  const totals = sumRows(stats.rows);
  const rows: Row[] = stats.rows.map((row) => ({
    ...row,
    key: row.userId ? `u:${row.userId}` : `n:${row.name}`,
    share: sharePercent(row.awardCount, totals.awardCount),
  }));

  if (rows.length === 0) {
    return <EmptyState>부여된 상벌점이 없습니다.</EmptyState>;
  }

  return (
    <>
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-5">
          <StatTile label="부여자" value={`${stats.teacherCount}명`} />
          <StatTile label="부여 건수" value={totals.awardCount} />
          <StatTile label="상점" value={totals.merit} valueClassName="text-blue" />
          <StatTile label="벌점" value={totals.demerit} valueClassName="text-rose" />
          <StatTile label="상쇄점" value={totals.offset} valueClassName="text-green" />
        </div>
      </div>

      <TeacherChart rows={rows} />
      <TeacherTable rows={rows} />
    </>
  );
}

export function TeachersSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonStats count={5} />
      <Skeleton className="h-[236px]" />
      <SkeletonTable rows={8} />

      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

function TeacherTable({ rows }: { rows: Row[] }) {
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "부여자",
      card: "title",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">
            {honorificName(row.name, "ADMIN")}
          </span>
          {row.removed && <Badge tone="cancelled">삭제된 계정</Badge>}
        </span>
      ),
    },
    {
      key: "awardCount",
      header: "건수",
      width: "w-[84px]",
      sort: "descending",
      card: "trailing",
      cell: (row) => <span className="font-medium text-ink">{row.awardCount}건</span>,
    },
    {
      key: "share",
      header: "비중",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.share}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.totals.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[80px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-rose">{row.totals.demerit}</span>,
    },
    {
      key: "offset",
      header: "상쇄",
      width: "w-[72px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.totals.offset === 0 ? "text-mut2" : "text-green"}`}
        >
          {row.totals.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: "순점수",
      width: "w-[88px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.totals.net >= 0 ? "text-green" : "text-rose"}`}
        >
          {signedNet(row.totals.net)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="부여자별 합계"
      hint="비중은 전체 부여 건수에서 차지하는 몫입니다."
    >
      <DataTable
        minWidth={640}
        narrow="cards"
        rows={rows}
        rowKey={(row) => row.key}
        columns={columns}
      />
    </SectionCard>
  );
}

function sumRows(rows: TeacherStats["rows"]) {
  return rows.reduce(
    (sum, row) => ({
      merit: sum.merit + row.totals.merit,
      demerit: sum.demerit + row.totals.demerit,
      offset: sum.offset + row.totals.offset,
      awardCount: sum.awardCount + row.awardCount,
    }),
    { merit: 0, demerit: 0, offset: 0, awardCount: 0 },
  );
}

function sharePercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const pct = (part / whole) * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}
