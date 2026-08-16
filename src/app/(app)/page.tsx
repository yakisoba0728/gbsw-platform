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

/**
 * 카드 제목은 메뉴(nav.ts)와 같은 이름을 쓴다. MERIT_TRACK_LABELS(교내·기숙사)는
 * 탭·배지처럼 짧아야 하는 자리용이라 제목으로는 쓰지 않는다.
 */
const TRACK_TITLES: Record<MeritTrack, string> = {
  SCHOOL: "그린마일리지",
  DORM: "기숙사 상벌점",
};

/** 대시보드에 남길 최근 부여 줄 수. 넘치면 "전체 보기"로 넘긴다. */
const RECENT_ROWS = 6;

/**
 * 대시보드. 역할에 따라 다른 요약을 보여준다.
 *
 * **요약과 링크만 둔다** — 통계 화면을 여기에 다시 만들지 않는다. 대시보드가
 * 각 모듈의 축소판이 되기 시작하면 모듈이 늘 때마다 여기가 함께 커지고,
 * 어느 화면을 고쳐야 하는지가 흐려진다.
 */
export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="rounded-card border border-line bg-surface p-6 lg:p-8">
        <p className="text-[13px] font-semibold text-pri">
          {user.role ? ROLE_LABELS[user.role] : "역할 미지정"}
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-[-0.01em] text-ink lg:text-2xl">
          {user.name}님, 안녕하세요.
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

/**
 * 학년도가 없으면 상벌점 요약 자체가 성립하지 않는다 — 카드 하나로 대신한다.
 *
 * 공용 안내를 쓴다. 전에는 이 화면만 같은 사정을 자기 안에서 다시 그려서,
 * "세 화면이 같은 화면을 보여주도록 통일한다"던 컴포넌트가 정작 대시보드는
 * 통일하지 못했다. 제목("상벌점")은 여기서만 붙는다 — 이 안내가 화면 전체가
 * 아니라 여러 카드 중 한 칸을 대신하는 자리라서다.
 */
function NoYearCard() {
  return <NoAcademicYearNotice title="상벌점" />;
}

async function AdminSummary({ user }: { user: SessionUser }) {
  let summaries: MeritSummary[];
  let recent: (Awaited<ReturnType<typeof listRecentAwards>>[number] & {
    track: MeritTrack;
  })[];
  try {
    const [school, dorm, schoolRecent, dormRecent] = await Promise.all([
      getMeritSummary(user, "SCHOOL"),
      getMeritSummary(user, "DORM"),
      listRecentAwards(user, "SCHOOL"),
      listRecentAwards(user, "DORM"),
    ]);
    summaries = [school, dorm];

    // 트랙별로 받아 와 시간순으로 합친다. "오늘 무슨 일이 있었나"는 교내·기숙사를
    // 가리지 않는 질문인데, 여기가 교내만 보여주는 바람에 사감은 대시보드에서
    // 기숙사 숫자를 하나도 볼 수 없었다.
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
      <div className="grid gap-3 lg:grid-cols-2">
        {summaries.map((summary) => (
          <AdminTrackCard key={summary.track} summary={summary} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/*
         * track을 붙이지 않는다 — 교내로 고정해 두면 사감이 매번 탭을 되돌려야
         * 한다. 두 화면 모두 안에 트랙 탭이 있다.
         */}
        <QuickLink
          href="/merit"
          title="상벌점 부여"
          hint="교내·기숙사 탭에서 반을 골라 여러 명에게 한 번에 줄 수 있습니다"
        />
        <QuickLink
          href="/admin/merit/rules"
          title="항목 관리"
          hint="상점·벌점 규정을 추가하고 고칩니다"
        />
      </div>

      <SectionCard
        flush
        headingLevel={3}
        title="최근 부여"
        aside={<CardLink href="/merit/recent">전체 보기</CardLink>}
      >
        {recent.length === 0 ? (
          <EmptyState variant="inside">아직 부여된 상벌점이 없습니다.</EmptyState>
        ) : (
          <ul>
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 border-b border-line2 px-5 py-2.5 last:border-0"
              >
                <span className="w-[64px] shrink-0 text-[12px] text-mut">
                  {formatDate(row.createdAt)}
                </span>
                {/* 합쳐 놓은 목록이라 어느 트랙인지가 줄마다 보여야 한다. */}
                <span className="w-[38px] shrink-0 text-[11px] font-semibold text-mut2">
                  {MERIT_TRACK_LABELS[row.track]}
                </span>
                <KindBadge kind={row.kind} />
                <Link
                  href={`/merit/students/${row.studentProfileId}?track=${row.track}`}
                  className="shrink-0 font-semibold text-ink hover:text-pri"
                >
                  {row.studentName}
                </Link>
                <span
                  className={
                    row.status === "CANCELLED"
                      ? "flex-1 truncate text-[13px] text-mut line-through"
                      : "flex-1 truncate text-[13px] text-mut"
                  }
                >
                  {row.label}
                </span>
                <span className={`shrink-0 font-bold ${kindColorClass(row.kind)}`}>
                  {signedPoints(row.kind, row.points)}
                </span>
              </li>
            ))}
          </ul>
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
      <p className="mt-3 text-[12px] text-mut">
        {summary.year === null ? "입학부터 전체 누적" : `${summary.year}학년도`} · 부여{" "}
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
    <div className="grid gap-3 lg:grid-cols-2">
      <TrackCard track="SCHOOL" view={school} />
      <TrackCard track="DORM" view={dorm} />
    </div>
  );
}

async function ChildSummary({ user }: { user: SessionUser }) {
  const children = await listMyChildren(user);
  if (children.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface p-6">
        <p className="text-sm text-mut">연결된 자녀가 없습니다.</p>
      </section>
    );
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
      <p className="text-[13px] font-semibold text-ink">{first.name}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <TrackCard track="SCHOOL" view={school} />
        <TrackCard track="DORM" view={dorm} />
      </div>
      {children.length > 1 && (
        <p className="text-[12px] text-mut">
          자녀가 여럿입니다.{" "}
          <Link href="/merit" className="font-semibold text-pri hover:underline">
            상벌점
          </Link>
          에서 골라 볼 수 있습니다.
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
      <p className="mt-3 text-[12px] text-mut">
        {view.year === null
          ? `${MERIT_TRACK_LABELS[track]}는 입학부터 전체 누적입니다`
          : `${view.year}학년도 · 매 학년도 새로 시작합니다`}
      </p>
    </SectionCard>
  );
}

/**
 * 카드 머리글 오른쪽의 "더 보기" 링크.
 *
 * 화살표는 `aria-hidden`으로 감춘다 — 전에는 문자 그대로 두어 화면을 못 보는
 * 사람에게 "전체 보기 오른쪽 화살표"로 읽혔다. 방향을 알려주는 장식이지
 * 링크 이름의 일부가 아니다.
 */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-[13px] font-semibold text-pri hover:underline"
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
      className="rounded-card border border-line bg-surface p-5 transition-colors hover:border-pri"
    >
      <h3 className="text-[15px] font-extrabold text-ink">{title}</h3>
      <p className="mt-1 text-[12.5px] text-mut">{hint}</p>
    </Link>
  );
}
