import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  signedNet,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { ClassNetChart, StudentNetChart } from "@/components/merit/charts";
import { demeritCellClass } from "@/components/merit/demerit-level";
import { TrackTabs } from "@/components/merit/track-tabs";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/table";
import { hrefWith } from "@/lib/search-params";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getMeritStats, type MeritStats } from "@/modules/merit/stats.service";

export const metadata: Metadata = { title: "반·학생별 통계" };

const PATH = "/merit/stats/classes";

type ClassRow = MeritStats["classes"][number];

/** 반을 고르면 만들어지는 주소. 트랙·학년도는 그대로 두고 반만 바꾼다. */
type Patch = Record<string, string | null>;

export default async function ClassStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year) ? Number(raw.year) : undefined;

  // 둘 다 유효할 때만 반을 고른 것으로 친다 — 하나만 있는 중간 상태는 전교로 떨어진다.
  const grade = numberParam(raw.grade, 1, 3);
  const classNo = numberParam(raw.classNo, 1, 20);
  const scope = grade !== null && classNo !== null ? { grade, classNo } : undefined;

  let stats: MeritStats | null = null;
  try {
    stats = await getMeritStats(actor, track, year, new Date(), scope);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  function href(patch: Patch): string {
    return hrefWith(PATH, raw, patch);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* h1은 상단바가 그린다 — 여기는 h2고 카드는 h3다. */}
      <h2 className="text-title font-semibold text-ink">반·학생별 통계</h2>

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
                {stats.scope.grade}학년 {stats.scope.classNo}반만 보는 중
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
            <ClassView
              scope={stats.scope}
              summary={stats.classes[0]}
              students={stats.students}
              thresholds={stats.thresholds}
              track={track}
            />
          ) : (
            <SchoolView rows={stats.classes} href={href} />
          )}

          <WatchList
            rows={stats.watchList}
            track={track}
            thresholds={stats.thresholds}
            scoped={stats.scope !== null}
          />
        </>
      )}
    </div>
  );
}

/** 전교를 볼 때 — 학년으로 접어 보고, 반끼리 비교하고, 반을 고른다. */
function SchoolView({
  rows,
  href,
}: {
  rows: ClassRow[];
  href: (patch: Patch) => string;
}) {
  if (rows.length === 0) {
    return <EmptyState>배정된 반이 없습니다.</EmptyState>;
  }

  return (
    <>
      <GradeTable rows={foldByGrade(rows)} />
      <ClassNetChart
        rows={rows}
        hrefFor={(row) =>
          href({ grade: String(row.grade), classNo: String(row.classNo) })
        }
      />
      <ClassTable rows={rows} href={href} />
    </>
  );
}

/** 반 하나를 볼 때 — 그 반의 합계와 반 안에서의 분포. */
function ClassView({
  scope,
  summary,
  students,
  thresholds,
  track,
}: {
  scope: { grade: number; classNo: number };
  /** 명단이 비면 집계에도 그 반이 없다. */
  summary: ClassRow | undefined;
  students: MeritStats["students"];
  thresholds: DemeritThresholds;
  track: MeritTrack;
}) {
  if (!summary || !students || students.length === 0) {
    return (
      <EmptyState>
        {scope.grade}학년 {scope.classNo}반에 배정된 학생이 없습니다.
      </EmptyState>
    );
  }

  return (
    <>
      {/* 뷰포트가 아니라 놓인 자리의 폭을 본다 — 사이드바가 폭을 먹는다. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-6">
          <StatTile label="인원" value={summary.students} valueClassName="text-ink" />
          <StatTile label="상점" value={summary.merit} valueClassName="text-blue" />
          <StatTile label="벌점" value={summary.demerit} valueClassName="text-rose" />
          <StatTile
            label="상쇄점"
            value={summary.offset}
            valueClassName={summary.offset === 0 ? "text-mut2" : "text-green"}
          />
          <StatTile
            label="순점수"
            value={signedNet(summary.net)}
            valueClassName={summary.net >= 0 ? "text-green" : "text-rose"}
          />
          <StatTile
            label="1인 평균"
            value={signedNet(summary.avgNet)}
            valueClassName={summary.avgNet >= 0 ? "text-green" : "text-rose"}
          />
        </div>
      </div>

      <StudentNetChart
        rows={students}
        thresholds={thresholds}
        hrefFor={(id) => `/merit/students/${id}?track=${track}`}
      />
    </>
  );
}

/**
 * 학년별 소계. 반 12개를 나열하기 전에 "어느 학년이 무거운가"를 먼저 답한다.
 * 벌점 기준은 학생 한 명에게 매기는 값이라 소계에는 강조를 걸지 않는다.
 */
function GradeTable({ rows }: { rows: GradeRow[] }) {
  const columns: Column<GradeRow>[] = [
    {
      key: "grade",
      header: "학년",
      width: "w-[92px]",
      card: "title",
      cell: (row) => <span className="font-medium text-ink">{row.grade}학년</span>,
    },
    {
      key: "classes",
      header: "반",
      width: "w-[64px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.classes}</span>,
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
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-rose">{row.demerit}</span>,
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
      title="학년별 소계"
      hint="반을 학년으로 합친 값입니다."
      aside={<span className="text-caption text-mut">{rows.length}개 학년</span>}
    >
      <DataTable
        minWidth={600}
        narrow="cards"
        rows={rows}
        rowKey={(row) => String(row.grade)}
        columns={columns}
      />
    </SectionCard>
  );
}

/** 반별 현황. 학급 이름이 그 반만 보는 링크다. */
function ClassTable({
  rows,
  href,
}: {
  rows: ClassRow[];
  href: (patch: Patch) => string;
}) {
  const columns: Column<ClassRow>[] = [
    {
      key: "class",
      header: "학급",
      width: "w-[128px]",
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
      width: "w-[72px]",
      card: "meta",
      cell: (row) => <span className="text-mut">{row.students}</span>,
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      width: "w-[84px]",
      card: "meta",
      // 강조하지 않는다. 기준(20/30)은 **학생 한 명**에게 정한 값이고 반 단위
      // 정책은 어디에도 없다 — 24명짜리 반의 합계는 예외 없이 기준을 넘으므로
      // 칠하면 모든 반이 붉어져 표시가 아무것도 못 가린다. 위험한 학생은
      // 아래 「기준 초과 학생」이 이름으로 짚는다.
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
      hint="학급을 누르면 그 반만 봅니다."
      aside={<span className="text-caption text-mut">{rows.length}개 반</span>}
    >
      <DataTable
        minWidth={540}
        narrow="cards"
        rows={rows}
        rowKey={(row) => `${row.grade}-${row.classNo}`}
        columns={columns}
      />
    </SectionCard>
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
      width: "w-[148px]",
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
      width: "w-[84px]",
      card: "trailing",
      cell: (row) => (
        <span className={demeritCellClass(thresholds, row.demerit)}>{row.demerit}</span>
      ),
    },
  ];

  return (
    <SectionCard
      flush
      headingLevel={3}
      title="기준 초과 학생"
      // 기준 숫자를 적는다 — 관리자가 설정에서 바꾸는 값이라 안 보이면 명단 길이가 설명되지 않는다.
      hint={`${where}에서 벌점 총합이 ${thresholds.warn}점 이상인 학생이며, 회부·통보는 일어나지 않습니다.`}
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
      aside={<span className="text-caption text-mut">{rows.length}명</span>}
    >
      {rows.length === 0 ? (
        <EmptyState variant="inside">
          {where}에 벌점 {thresholds.warn}점 이상인 학생이 없습니다.
        </EmptyState>
      ) : (
        <DataTable
          minWidth={460}
          narrow="cards"
          rows={ranked}
          rowKey={(row) => row.studentProfileId}
          columns={columns}
        />
      )}
    </SectionCard>
  );
}

type GradeRow = {
  grade: number;
  /** 이 학년의 반 수. 학년마다 반 수가 다르면 소계를 그대로 비교하면 안 된다. */
  classes: number;
  students: number;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
  avgNet: number;
};

/** 반별 집계를 학년으로 접는다. 1인 평균은 학년 인원으로 다시 나눈다. */
function foldByGrade(rows: ClassRow[]): GradeRow[] {
  const byGrade = new Map<number, GradeRow>();

  for (const row of rows) {
    const cur =
      byGrade.get(row.grade) ??
      {
        grade: row.grade,
        classes: 0,
        students: 0,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
        avgNet: 0,
      };

    byGrade.set(row.grade, {
      ...cur,
      classes: cur.classes + 1,
      students: cur.students + row.students,
      merit: cur.merit + row.merit,
      demerit: cur.demerit + row.demerit,
      offset: cur.offset + row.offset,
      net: cur.net + row.net,
    });
  }

  return [...byGrade.values()]
    .map((row) => ({
      ...row,
      // 인원 0인 학년은 만들어지지 않는다 — 반이 있으면 학생도 있다.
      avgNet: Math.round((row.net / row.students) * 10) / 10,
    }))
    .sort((a, b) => a.grade - b.grade);
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
