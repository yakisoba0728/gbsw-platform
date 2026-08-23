import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getTeacherStats, type TeacherStats } from "@/modules/merit/stats.service";
import { TeacherChart } from "./teacher-chart";

export const metadata: Metadata = { title: "교사별 통계" };

/** 표와 그래프가 함께 쓰는 한 줄. 비중은 화면에서만 계산한다. */
type Row = TeacherStats["rows"][number] & { key: string; share: string };

export default async function TeacherStatsPage({
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

  let stats: TeacherStats | null = null;
  try {
    stats = await getTeacherStats(actor, track, year);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  const totals = stats ? sumRows(stats.rows) : null;
  const rows: Row[] =
    stats && totals
      ? stats.rows.map((row) => ({
          ...row,
          // 서비스가 계정 있는 사람과 이름만 남은 사람을 가르는 방식을 그대로 쓴다.
          key: row.userId ? `u:${row.userId}` : `n:${row.name}`,
          share: sharePercent(row.awardCount, totals.awardCount),
        }))
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="교사별 통계"
        hint={
          stats
            ? isYearScoped(track)
              ? `${stats.year}학년도 집계`
              : "입학부터 전체 누적"
            : undefined
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => hrefWith("/merit/stats/teachers", raw, { track: t })}
            size="sm"
          />
        }
      />

      {!stats || !totals ? (
        <NoAcademicYearNotice />
      ) : rows.length === 0 ? (
        <EmptyState>부여된 상벌점이 없습니다.</EmptyState>
      ) : (
        <>
          {/* 뷰포트가 아니라 놓인 자리의 폭을 본다 — 통계 개요와 같은 기준이다. */}
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
      )}
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
          <span className="font-medium text-ink">{row.name}</span>
          {/* 계정이 사라져도 부여 기록은 남는다 — 이름만 남았다는 사실을 적는다. */}
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
      // 카드 모드에는 머리글이 없다 — 단위를 붙여야 점수와 헷갈리지 않는다.
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

/** 전체 합계 — 비중의 분모이자 머리글 숫자다. */
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

/** `32%` · `2.4%`. 10% 미만은 소수 한 자리까지 적는다 — 반올림하면 전부 0%가 된다. */
function sharePercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const pct = (part / whole) * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}
