import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth, type SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ROLE_LABELS } from "@/core/authz/roles";
import { MERIT_TRACK_LABELS, type MeritTrack } from "@/core/authz/merit-track";
import { KindBadge, kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  getMyMerit,
  listMyChildren,
  listRecentAwards,
  getChildMerit,
  type StudentMeritView,
} from "@/modules/merit/award.service";
import { getMeritSummary, type MeritSummary } from "@/modules/merit/stats.service";

/** 카드 제목은 메뉴(nav.ts)와 같은 이름을 쓴다. */
const TRACK_TITLES: Record<MeritTrack, string> = {
  SCHOOL: "그린마일리지",
  DORM: "기숙사 상벌점",
};

/** 대시보드에 남길 최근 부여 줄 수. 넘치면 "전체 보기"로 넘긴다. */
const RECENT_ROWS = 6;

type RecentAward = Awaited<ReturnType<typeof listRecentAwards>>[number] & {
  track: MeritTrack;
};

/**
 * 넓은 폭에서는 표, 좁은 폭에서는 카드다. 폰에서 열 폭을 나눠 가지면 사유가
 * 25px까지 눌려 "왜 받았는지"가 사라진다.
 */
const RECENT_COLUMNS: readonly Column<RecentAward>[] = [
  {
    key: "date",
    header: "발생일",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="font-mono text-xs whitespace-nowrap text-mut">
        {formatDate(row.createdAt)}
      </span>
    ),
  },
  {
    key: "track",
    header: "트랙",
    card: "meta",
    cardLabel: false,
    cell: (row) => (
      <span className="text-xs whitespace-nowrap text-mut2">
        {MERIT_TRACK_LABELS[row.track]}
      </span>
    ),
  },
  {
    // 카드에는 넣지 않는다 — 점수의 부호와 색이 이미 종류를 말한다.
    key: "kind",
    header: "종류",
    cell: (row) => <KindBadge kind={row.kind} />,
  },
  {
    key: "student",
    header: "학생",
    card: "title",
    cell: (row) => (
      <Link
        href={`/merit/students/${row.studentProfileId}?track=${row.track}`}
        className="font-medium whitespace-nowrap text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
      >
        {row.studentName}
      </Link>
    ),
  },
  {
    key: "label",
    header: "규정",
    card: "title",
    cell: (row) => (
      <span
        className={
          row.status === "CANCELLED"
            ? "text-caption text-mut line-through"
            : "text-caption text-mut"
        }
      >
        {row.label}
      </span>
    ),
  },
  {
    key: "points",
    header: "점수",
    card: "trailing",
    cell: (row) => (
      <span className={`font-medium ${kindColorClass(row.kind)}`}>
        {signedPoints(row.kind, row.points)}
      </span>
    ),
  },
];

/** 대시보드. 요약과 링크만 둔다 — 통계 화면을 여기에 다시 만들지 않는다. */
export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="rounded-card border border-line bg-surface p-8">
        <p className="text-caption text-mut">
          {user.role ? ROLE_LABELS[user.role] : "역할 없음"}
        </p>
        <h2 className="mt-1 text-title font-semibold text-ink">
          {user.name}님
        </h2>
      </section>

      {can(user, "merit:read:any") ? (
        <AdminSummary user={user} />
      ) : user.role === "PARENT" ? (
        <ChildSummary user={user} />
      ) : (
        <MySummary user={user} />
      )}
    </div>
  );
}

/** 학년도가 없으면 상벌점 요약이 성립하지 않는다 — 카드 하나로 대신한다. */
function NoYearCard() {
  return <NoAcademicYearNotice title="상벌점" />;
}

async function AdminSummary({ user }: { user: SessionUser }) {
  let summaries: MeritSummary[];
  let recent: RecentAward[];
  try {
    const [school, dorm, schoolRecent, dormRecent] = await Promise.all([
      getMeritSummary(user, "SCHOOL"),
      getMeritSummary(user, "DORM"),
      listRecentAwards(user, "SCHOOL"),
      listRecentAwards(user, "DORM"),
    ]);
    summaries = [school, dorm];

    // 트랙별로 받아 시간순으로 합친다 — "오늘 무슨 일이 있었나"는 교내·기숙사를
    // 가리지 않는 질문이다.
    recent = [
      ...schoolRecent.map((row) => ({ ...row, track: "SCHOOL" as const })),
      ...dormRecent.map((row) => ({ ...row, track: "DORM" as const })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, RECENT_ROWS);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoYearCard />;
  }

  return (
    <>
      <TwoUp>
        {summaries.map((summary) => (
          <AdminTrackCard key={summary.track} summary={summary} />
        ))}
      </TwoUp>

      <TwoUp>
        {/* track을 붙이지 않는다 — 두 화면 모두 안에 트랙 탭이 있다. */}
        <QuickLink
          href="/merit"
          title="상벌점 부여"
          hint="반을 골라 여러 명에게 한 번에 부여합니다"
        />
        <QuickLink
          href="/admin/merit/rules"
          title="규정 관리"
          hint="상점·벌점 규정을 고칩니다"
        />
      </TwoUp>

      <SectionCard
        flush
        headingLevel={3}
        title="최근 부여"
        aside={<CardLink href="/merit/recent">전체 보기</CardLink>}
      >
        {recent.length === 0 ? (
          <EmptyState variant="inside">부여된 상벌점이 없습니다.</EmptyState>
        ) : (
          <DataTable
            minWidth={560}
            rows={recent}
            rowKey={(row) => row.id}
            columns={RECENT_COLUMNS}
            narrow="cards"
          />
        )}
      </SectionCard>
    </>
  );
}

function AdminTrackCard({ summary }: { summary: MeritSummary }) {
  return (
    <SectionCard
      headingLevel={3}
      title={TRACK_TITLES[summary.track]}
      aside={
        <CardLink href={`/merit/stats?track=${summary.track}`}>통계</CardLink>
      }
    >
      <MeritTotalsCards totals={summary.totals} />
      <p className="mt-3 text-xs text-mut">
        {summary.year === null ? "입학부터 누적" : `${summary.year}학년도`} · 부여{" "}
        {summary.totals.awardCount}건
      </p>
    </SectionCard>
  );
}

async function MySummary({ user }: { user: SessionUser }) {
  let school: StudentMeritView;
  let dorm: StudentMeritView;
  try {
    [school, dorm] = await Promise.all([
      getMyMerit(user, "SCHOOL"),
      getMyMerit(user, "DORM"),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoYearCard />;
  }

  return (
    <TwoUp>
      <TrackCard track="SCHOOL" view={school} />
      <TrackCard track="DORM" view={dorm} />
    </TwoUp>
  );
}

async function ChildSummary({ user }: { user: SessionUser }) {
  const children = await listMyChildren(user);
  if (children.length === 0) {
    return <EmptyState>연결된 자녀가 없습니다.</EmptyState>;
  }

  const first = children[0];
  let school: StudentMeritView;
  let dorm: StudentMeritView;
  try {
    [school, dorm] = await Promise.all([
      getChildMerit(user, first.studentProfileId, "SCHOOL"),
      getChildMerit(user, first.studentProfileId, "DORM"),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoYearCard />;
  }

  return (
    <>
      <p className="text-caption font-medium text-ink">{first.name}</p>
      <TwoUp>
        <TrackCard track="SCHOOL" view={school} />
        <TrackCard track="DORM" view={dorm} />
      </TwoUp>
      {children.length > 1 && (
        <p className="text-xs text-mut">
          자녀가 여럿입니다.{" "}
          <Link
            href="/merit"
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            상벌점
          </Link>
          에서 골라 보세요.
        </p>
      )}
    </>
  );
}

function TrackCard({
  track,
  view,
}: {
  track: MeritTrack;
  view: StudentMeritView;
}) {
  return (
    <SectionCard
      headingLevel={3}
      title={TRACK_TITLES[track]}
      aside={<CardLink href={`/merit?track=${track}`}>내역</CardLink>}
    >
      <MeritTotalsCards totals={view.totals} />
      <p className="mt-3 text-xs text-mut">
        {view.year === null
          ? `${MERIT_TRACK_LABELS[track]}는 입학부터 누적입니다`
          : `${view.year}학년도 · 학년도마다 새로 시작합니다`}
      </p>
    </SectionCard>
  );
}

/**
 * 카드 두 장을 나란히. 뷰포트가 아니라 놓인 자리의 폭을 본다 — 사이드바가
 * 서는 폭과 두 단이 들어가는 폭은 같지 않다.
 */
function TwoUp({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

/** 카드 머리글 오른쪽의 링크. 화살표는 링크 이름이 아니라 장식이다. */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-caption text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
    >
      {children} <span aria-hidden>→</span>
    </Link>
  );
}

function QuickLink({
  href,
  title,
  hint,
}: {
  href: string;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-card border border-line bg-surface p-5 transition-colors hover:bg-soft"
    >
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-caption text-mut">{hint}</p>
    </Link>
  );
}
