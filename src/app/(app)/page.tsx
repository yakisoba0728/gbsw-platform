import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth, type SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { ROLE_LABELS } from "@/core/authz/roles";
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
          {user.name}님, {greetingFor(new Date())}
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
  try {
    summaries = await Promise.all([
      getMeritSummary(user, "SCHOOL"),
      getMeritSummary(user, "DORM"),
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

function AdminTrackCard({ summary }: { summary: MeritSummary }) {
  return (
    <SectionCard
      headingLevel={3}
      title={MERIT_TRACK_TITLES[summary.track]}
      // 위는 그 트랙의 부여 화면, 아래는 통계다. 둘 다 통계로 보내면 카드에
      // 같은 곳으로 가는 링크가 두 개 서게 된다.
      aside={<CardLink href={`/merit?track=${summary.track}`}>이동</CardLink>}
    >
      <MeritTotalsCards totals={summary.totals} />
      {/* 날 수는 서비스가 갖고 있다 — 화면에 7을 적으면 창을 바꿀 때 두 곳이 갈린다. */}
      <p className="mt-3 text-xs text-mut">
        최근 {SUMMARY_DAYS}일 · {summary.totals.awardCount}건 ·{" "}
        <Link
          href={`/merit/stats?track=${summary.track}`}
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
