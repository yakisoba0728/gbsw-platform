import Link from "next/link";
import type { SessionUser } from "@/core/auth/session";
import {
  isYearScoped,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { DemeritCell } from "@/components/merit/demerit-level";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { formatSeat } from "@/lib/student-number";
import {
  getRankingStats,
  type RankedStudent,
  type RankingStats,
} from "@/modules/merit/stats.service";


type Patch = Record<string, string | null>;


export type RankingPromise = Promise<RankingStats | null>;

/**
 * 현재 학년도가 없으면 안내로 바꾼다. 페이지에서 try/catch로 잡으면 거기서 기다리게 되고,
 * 경계 밖에서 던지면 error.tsx로 새어 화면 전체가 오류가 된다.
 */
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

/** 집계 범위 한 줄. 본문과 같은 약속을 기다리므로 질의가 늘지 않는다. */
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

/** 순위·명단. 조건이 바뀔 때 뼈대로 바뀌는 것은 여기까지다. */
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

/**
 * 표 자리. 반을 고르면 명단 하나, 전교면 학생 순위와 반 순위 둘이다 — 개수가
 * 어긋나면 자료가 도착할 때 자리가 통째로 다시 짜인다. 반은 쿼리에서 나오므로
 * 자료를 기다리지 않고도 어느 쪽인지 안다.
 */
export function RankingSkeleton({ scoped }: { scoped: boolean }) {
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

/** 학번. 반이 없는 학생도 순위에 남으므로 빈칸을 설명해야 한다. */
function classLabel(row: RankedStudent): string {
  return formatSeat(row) ?? "반 미배정";
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
      // 미리 정렬해 내려온 열이다. 화면에서 바꿀 수는 없지만, 무엇을
      // 기준으로 세운 표인지는 머리글 셀이 알려야 한다(teachers.tsx와 같다).
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
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
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
      // 반 합계에는 강조를 대지 않는다 — 기준은 학생 한 명에게 정한 값이라
      // 인원이 많은 반은 예외 없이 넘는다.
      cell: (row) => <span className="text-rose">{row.demerit}</span>,
    },
    {
      key: "avgNet",
      // 미리 정렬해 내려온 열이다. 화면에서 바꿀 수는 없지만, 무엇을
      // 기준으로 세운 표인지는 머리글 셀이 알려야 한다(teachers.tsx와 같다).
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
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
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
      // 미리 정렬해 내려온 열이다. 화면에서 바꿀 수는 없지만, 무엇을
      // 기준으로 세운 표인지는 머리글 셀이 알려야 한다(teachers.tsx와 같다).
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

  return (
    <SectionCard
      flush
      headingLevel={3}
      title={`${stats.scope?.grade}학년 ${stats.scope?.classNo}반`}
      hint="번호순 · 전원"
      aside={<span className="text-xs text-mut">{stats.students.length}명</span>}
    >
      {/* 비어도 카드 제목을 남긴다 — 제목까지 사라지면 무엇이 없는 것인지 모른다. */}
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
