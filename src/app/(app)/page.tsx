import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth, type SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { honorificName, ROLE_LABELS } from "@/core/authz/roles";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACK_TITLES,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { formatMonthDay } from "@/lib/datetime";
import { greetingFor } from "@/lib/greeting";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  getMyMerit,
  listMyChildren,
  getChildMerit,
  type StudentMeritView,
} from "@/modules/merit/award.service";
import {
  getMeritSummary,
  SUMMARY_DAYS,
  type MeritSummary,
} from "@/modules/merit/stats.service";

/**
 * 대시보드. 트랙별 요약 카드만 둔다 — 목록도 바로가기도 여기서 다시 만들지 않는다.
 * 갈 곳은 전부 사이드바(nav.ts)에 있다.
 */
export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className={cardClass("page")}>
        <p className="text-caption text-mut">
          {user.role ? ROLE_LABELS[user.role] : "역할 없음"}
        </p>
        <h2 className="mt-1 text-title font-semibold text-ink">
          {honorificName(user.name, user.role)}, {greetingFor(new Date())}
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
  // 두 카드가 같은 순간을 본다. 각자 new Date()를 만들면 자정을 끼고 창이 하루
  // 어긋나, 나란히 선 두 카드가 다른 기간을 적는다.
  const now = new Date();
  try {
    summaries = await Promise.all([
      getMeritSummary(user, "SCHOOL", now),
      getMeritSummary(user, "DORM", now),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return <NoYearCard />;
  }

  return (
    <TwoUp>
      {summaries.map((summary) => (
        <AdminTrackCard key={summary.track} summary={summary} />
      ))}
    </TwoUp>
  );
}

/**
 * 교사 카드. **학생 카드와 숫자 모양이 같지만 뜻이 다르다** — 학생 쪽은 그 학생의
 * 현재 점수(누적)이고, 이쪽은 **최근 이레 동안 학교에서 오간 양**이다. 그 차이를
 * 큰 숫자보다 먼저 읽히게 하는 것이 이 카드의 일이다.
 *
 * 그래서 기간은 제목 바로 아래(hint)에 날짜까지 적고, 어떻게 세는지(발생일 기준·
 * 상쇄점 제외)는 숫자 아래 잔글씨로 둔다. 상쇄점 제외는 `getMeritSummary`의 주석이
 * 「화면이 적는다」고 약속해 둔 것인데 실제로는 어디에도 없었다.
 */
function AdminTrackCard({ summary }: { summary: MeritSummary }) {
  return (
    <SectionCard
      headingLevel={3}
      title={MERIT_TRACK_TITLES[summary.track]}
      // 날 수도 날짜도 서비스가 갖고 있다 — 화면에 7을 적으면 창을 바꿀 때 두 곳이 갈린다.
      hint={
        <>
          최근 {SUMMARY_DAYS}일에 오간 점수
          <span className="mx-1.5 text-mut2" aria-hidden>
            ·
          </span>
          <span className="tabular-nums">
            {formatMonthDay(summary.window.from)} ~ {formatMonthDay(summary.window.to)}
          </span>
        </>
      }
      // 위는 그 트랙의 부여 화면, 아래는 통계다. 둘 다 통계로 보내면 카드에
      // 같은 곳으로 가는 링크가 두 개 서게 된다.
      aside={<CardLink href={`/merit?track=${summary.track}`}>이동</CardLink>}
    >
      <MeritTotalsCards totals={summary.totals} />
      <p className="mt-3 text-xs text-mut">
        {summary.totals.awardCount}건 · 발생일 기준 · 상쇄점 제외 ·{" "}
        <Link
          // 이름이 「전체 교사 통계」인데 개요로 보내면 교사 차원이 없는 화면이 나온다.
          href={`/merit/stats?view=teachers&track=${summary.track}`}
          className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          전체 교사 통계
        </Link>
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
      title={MERIT_TRACK_TITLES[track]}
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
