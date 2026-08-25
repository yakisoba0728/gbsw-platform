import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requirePermission, type SessionUser } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { DemeritCell } from "@/components/merit/demerit-level";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { SkeletonTable } from "@/components/ui/skeleton";
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

  const href = (patch: Patch) => hrefWith(PATH, raw as SearchParamsInput, patch);

  // 조회를 시작만 하고 기다리지 않는다. 기다리면 이 함수 전체가 멈춰서 트랙 탭과
  // 범위 배지까지 뼈대로 덮인다 — 방금 고른 조건이 사라지는 그 증상이다.
  // 두 경계가 같은 약속을 나눠 기다리므로 질의는 한 번이다.
  const statsPromise = loadStats(actor, track, year, scope);

  // 조건이 바뀌면 경계를 새로 만든다. 이미 해결된 Suspense 경계는 자식이 다시 매달려도
  // 뼈대 대신 옛 내용을 그대로 보여준다 — key가 없으면 탭을 눌러도 안 바뀐 것처럼 보인다.
  const boundaryKey = JSON.stringify({ track, year, grade, classNo });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <SectionCard
        variant="panel"
        title="순위 · 현황"
        hint={
          // 집계 범위는 데이터에서 나온다 — 본문과 같은 약속을 나눠 기다린다.
          <Suspense key={boundaryKey} fallback={<HintSkeleton />}>
            <RangeHint promise={statsPromise} track={track} />
          </Suspense>
        }
        aside={
          <TrackTabs
            current={track}
            hrefFor={(t) => href({ track: t })}
            size="sm"
          />
        }
      >
        {scope && (
          // 배지는 지금 고른 조건이다 — 서비스의 scope는 받은 인자를 그대로 돌려주므로
          // 데이터를 기다릴 이유가 없다. 경계 밖에 남긴다.
          //
          // 링크는 배지 밖에 둔다 — 안에 넣고 손가락 크기(min-h-9)를 주면
          // 배지가 40px짜리 알약이 되어 상태 표시가 아니라 버튼으로 읽힌다.
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" dot={false}>
              {scope.grade}학년 {scope.classNo}반
            </Badge>
            {/*
              ✕는 "누르면 이 필터가 풀린다"는 장식이다 — 링크 이름에 넣지 않는다.
              gap-1이 낱말 사이 공백을 대신한다 — inline-flex는 글자와 ✕ 사이의
              공백을 지워 "전교 보기✕"로 붙여 놓는다(BackLink와 같은 규격이다).
            */}
            <Link
              href={href({ grade: null, classNo: null })}
              className="inline-flex min-h-9 items-center gap-1 text-sm text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
            >
              전교 보기 <span aria-hidden>✕</span>
            </Link>
          </div>
        )}
      </SectionCard>

      {/* 순위표는 전부 같은 조회에서 나온다 — 경계를 하나로 둬야 한꺼번에 들어온다. */}
      <Suspense
        key={boundaryKey}
        fallback={<RankingSkeleton scoped={scope !== undefined} />}
      >
        <RankingBody promise={statsPromise} track={track} href={href} />
      </Suspense>
    </div>
  );
}

type StatsPromise = Promise<RankingStats | null>;

/**
 * 현재 학년도가 없으면 안내로 바꾼다. 페이지에서 try/catch로 잡으면 거기서 기다리게 되고,
 * 경계 밖에서 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 */
async function loadStats(
  actor: SessionUser,
  track: MeritTrack,
  year: number | undefined,
  scope: { grade: number; classNo: number } | undefined,
): StatsPromise {
  try {
    return await getRankingStats(actor, track, year, scope);
  } catch (error) {
    if (error instanceof AcademicYearError) return null;
    throw error;
  }
}

/** 집계 범위 한 줄. 본문과 같은 약속을 기다리므로 질의가 늘지 않는다. */
async function RangeHint({
  promise,
  track,
}: {
  promise: StatsPromise;
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

/** 순위·명단. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
async function RankingBody({
  promise,
  track,
  href,
}: {
  promise: StatsPromise;
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

/**
 * hint는 <p> 안에 들어간다 — Skeleton은 <div>라 문단에 넣으면 브라우저가 문단을
 * 먼저 닫아 버려 하이드레이션이 어긋난다. 같은 규격을 인라인으로 쓴다.
 */
function HintSkeleton() {
  return (
    <span className="inline-block h-4 w-64 max-w-full animate-pulse rounded-btn bg-soft align-middle" />
  );
}

/**
 * 표 자리. 반을 고르면 명단 하나, 전교면 학생 순위와 반 순위 둘이다 — 개수가
 * 어긋나면 자료가 도착할 때 자리가 통째로 다시 짜인다. 반은 쿼리에서 나오므로
 * 자료를 기다리지 않고도 어느 쪽인지 안다.
 */
function RankingSkeleton({ scoped }: { scoped: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <SkeletonTable rows={scoped ? 8 : 10} />
      {!scoped && <SkeletonTable rows={6} />}

      {/* 맨 뒤에 둔다 — 앞에 두면 space-y가 첫 표를 16px 밀어 내린다. */}
      <span className="sr-only">불러오는 중</span>
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
      // 기준을 넘긴 칸은 테두리가 붙어 18px 넓어진다 — 세 자리 수 몫을 미리 준다.
      width: "w-[86px]",
      card: "meta",
      // 학생 한 명의 벌점이라 기준을 그대로 댄다 — 반 합계와 달리 이 자리는 옳다.
      cell: (row) => <DemeritCell thresholds={stats.thresholds} demerit={row.demerit} />,
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
      // 기준을 넘긴 칸은 테두리가 붙어 18px 넓어진다 — 세 자리 수 몫을 미리 준다.
      width: "w-[90px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={stats.thresholds} demerit={row.demerit} />,
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
