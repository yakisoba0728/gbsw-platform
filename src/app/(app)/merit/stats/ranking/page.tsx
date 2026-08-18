import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { demeritCellClass } from "@/components/merit/demerit-level";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  getRankingStats,
  type RankedStudent,
  type RankingStats,
} from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "순위 · 현황" };

const PATH = "/merit/stats/ranking";

type Patch = Record<string, string | null>;

/** 범위 밖이면 없는 것으로 친다 — 조작된 쿼리는 전교로 떨어진다. */
function numberParam(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export default async function RankingPage({
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

  let stats: RankingStats | null = null;
  try {
    stats = await getRankingStats(actor, track, year, scope);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  const href = (patch: Patch) => hrefWith(PATH, raw as SearchParamsInput, patch);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* h1은 상단바가 그린다 — 여기는 h2고 카드는 h3다. */}
      <h2 className="text-title font-semibold text-ink">순위 · 현황</h2>

      <TrackTabs current={track} hrefFor={(t) => href({ track: t })} />

      {!stats ? (
        <NoAcademicYearNotice />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-caption text-mut">
              {isYearScoped(track)
                ? `${stats.year}학년도 집계 · 반 편성 ${stats.rosterYear}학년도`
                : `입학부터 전체 누적 · 반 편성 ${stats.rosterYear}학년도`}
            </p>
            {stats.scope && (
              <Badge tone="info" dot={false}>
                {stats.scope.grade}학년 {stats.scope.classNo}반
                {/* ✕는 "누르면 이 필터가 풀린다"는 장식이다 — 링크 이름에 넣지 않는다. */}
                <Link
                  href={href({ grade: null, classNo: null })}
                  className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  전교 보기 <span aria-hidden>✕</span>
                </Link>
              </Badge>
            )}
          </div>

          {stats.scope ? (
            <ClassRosterCard stats={stats} track={track} />
          ) : (
            <>
              <StudentRankCard stats={stats} track={track} />
              <ClassRankCard stats={stats} href={href} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** 학생 이름 → 그 학생의 상벌점 상세. 좁은 폭에서도 누를 수 있게 높이를 준다. */
function StudentLink({ row, track }: { row: RankedStudent; track: MeritTrack }) {
  return (
    <Link
      href={`/merit/students/${row.studentProfileId}?track=${track}`}
      className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
    >
      {row.name}
    </Link>
  );
}

/** 순점수 칸 — 부호와 색을 함께 준다. */
function netCell(row: RankedStudent | { net: number }) {
  return (
    <span className={row.net >= 0 ? "text-green" : "text-rose"}>{signedNet(row.net)}</span>
  );
}

/** 소속 표기. 반이 없는 학생도 순위에 남으므로 빈칸을 설명해야 한다. */
function classLabel(row: RankedStudent): string {
  if (row.grade === null || row.classNo === null) return "반 미배정";
  return `${row.grade}학년 ${row.classNo}반${row.number !== null ? ` ${row.number}번` : ""}`;
}

/** 전교 학생 순위 — 순점수 순. 동점은 같은 등수다. */
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
      cell: (row) => <span className="font-mono text-mut">{row.rank}</span>,
    },
    {
      key: "name",
      header: "이름",
      width: "w-[120px]",
      card: "title",
      cell: (row) => <StudentLink row={row} track={track} />,
    },
    {
      // 폭을 주지 않는다 — 남는 자리를 이 열이 가져간다.
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
      width: "w-[72px]",
      card: "meta",
      // 학생 한 명의 벌점이라 기준을 그대로 댄다 — 반 합계와 달리 이 자리는 옳다.
      cell: (row) => (
        <span className={demeritCellClass(stats.thresholds, row.demerit)}>
          {row.demerit}
        </span>
      ),
    },
    {
      // 0이어도 늘 낸다 — 없으면 상점 − 벌점이 순점수와 안 맞아 보여 표를 의심하게 된다
      // (정하윤: 상점 0 · 벌점 53 · 순점수 +7 — 상쇄 60이 있어야 읽힌다).
      key: "offset",
      header: "상쇄",
      width: "w-[72px]",
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

  if (stats.students.length === 0) {
    return <EmptyState>재학 중인 학생이 없습니다.</EmptyState>;
  }

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="학생 순위"
      hint="순점수 높은 순 · 동점은 같은 등수"
      aside={<span className="text-xs text-mut">{stats.students.length}명</span>}
    >
      <DataTable
        minWidth={660}
        narrow="cards"
        rows={stats.students}
        rowKey={(row) => row.studentProfileId}
        columns={columns}
      />
    </SectionCard>
  );
}

/** 반 순위 — 1인 평균 순점수 순. 반 이름을 누르면 그 반 명단으로 간다. */
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
      cell: (row) => <span className="font-mono text-mut">{row.rank}</span>,
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
      // 반 합계에는 강조를 대지 않는다 — 기준은 학생 한 명에게 정한 값이라
      // 인원이 많은 반은 예외 없이 넘는다.
      cell: (row) => <span className="text-rose">{row.demerit}</span>,
    },
    {
      key: "avgNet",
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

  if (stats.classes.length === 0) {
    return <EmptyState>배정된 반이 없습니다.</EmptyState>;
  }

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="반 순위"
      hint="1인 평균 순점수 순 · 반을 누르면 그 반 전원이 나옵니다"
      aside={<span className="text-xs text-mut">{stats.classes.length}개 반</span>}
    >
      <DataTable
        minWidth={620}
        narrow="cards"
        rows={stats.classes}
        rowKey={(row) => `${row.grade}-${row.classNo}`}
        columns={columns}
      />
    </SectionCard>
  );
}

/**
 * 반 하나의 명단. **전원이 번호순으로** 나온다 — 점수가 있는 학생만 내면
 * 명단에 구멍이 생겨 "빠진 건지 0점인지"를 구별할 수 없다. 등수는 붙이지 않는다:
 * 담임이 찾는 것은 "몇 등"이 아니라 그 학생 줄이다.
 */
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
      header: "번호",
      width: "w-[64px]",
      card: "trailing",
      cell: (row) => <span className="font-mono text-mut">{row.number ?? "—"}</span>,
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
      width: "w-[76px]",
      card: "meta",
      cell: (row) => (
        <span className={demeritCellClass(stats.thresholds, row.demerit)}>
          {row.demerit}
        </span>
      ),
    },
    {
      // 0이어도 늘 낸다 — 상점 − 벌점이 순점수와 안 맞아 보이면 표를 의심하게 된다.
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

  if (stats.students.length === 0) {
    return (
      <EmptyState>
        {stats.scope?.grade}학년 {stats.scope?.classNo}반에 배정된 학생이 없습니다.
      </EmptyState>
    );
  }

  return (
    <SectionCard
      flush
      headingLevel={3}
      title={`${stats.scope?.grade}학년 ${stats.scope?.classNo}반`}
      hint="번호순 · 전원"
      aside={<span className="text-xs text-mut">{stats.students.length}명</span>}
    >
      <DataTable
        minWidth={600}
        narrow="cards"
        rows={stats.students}
        rowKey={(row) => row.studentProfileId}
        columns={columns}
      />
    </SectionCard>
  );
}
