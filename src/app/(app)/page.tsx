import Link from "next/link";
import type { ReactNode } from "react";
import { kindColorClass, signedPoints } from "@/components/merit/kind-badge";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { SectionCard } from "@/components/ui/section-card";
import { StatStrip, StatTile } from "@/components/ui/stat-tile";
import { SummaryList, SummaryRow } from "@/components/ui/summary-list";
import { requireAuth, type SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACK_TITLES,
  signedNet,
  type MeritTrack,
} from "@/core/authz/merit-track";
import {
  isPassStatus,
  isPassType,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { formatMonthDay, formatMonthDayTime, formatTimeShort } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { listRecentPosts, type RecentPostView } from "@/modules/community/post.service";
import {
  getChildMerit,
  getMyMerit,
  listMyChildren,
  listRecentAwards,
  type StudentMeritView,
} from "@/modules/merit/award.service";
import { getMeritSummary, SUMMARY_DAYS } from "@/modules/merit/stats.service";
import {
  listActivePasses,
  listPendingPasses,
} from "@/modules/pass/decision.service";
import {
  PASS_STATUS_TONES,
  passEndLabel,
  passStatusLabel,
} from "@/modules/pass/pass.labels";
import {
  getMyChildPassesAwaitingConsent,
  getMyLivePasses,
} from "@/modules/pass/request.service";

export default async function DashboardPage() {
  const user = await requireAuth();

  if (can(user, "merit:read:any")) return <TeacherDashboard user={user} />;
  if (user.role === "PARENT") return <ParentDashboard user={user} />;
  return <StudentDashboard user={user} />;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl space-y-4">{children}</div>;
}

function TwoUp({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @3xl:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

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

function classLabel(
  grade: number | null | undefined,
  classNo: number | null | undefined,
  number: number | null | undefined,
): string | null {
  if (grade == null || classNo == null) return null;
  return number == null ? `${grade}-${classNo}` : `${grade}-${classNo} ${number}번`;
}

function passTypeLabel(value: string): string {
  return isPassType(value) ? PASS_TYPE_LABELS[value] : value;
}

function PassStatusBadge({ pass }: { pass: { type: string; status: string } }) {
  if (!isPassStatus(pass.status)) {
    return <Badge tone="neutral">{pass.status}</Badge>;
  }
  return (
    <Badge tone={PASS_STATUS_TONES[pass.status]}>{passStatusLabel(pass)}</Badge>
  );
}

function joinMeta(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function windowLabel(startAt: Date, endAt: Date): string {
  const sameDay = formatMonthDay(startAt) === formatMonthDay(endAt);
  return sameDay
    ? `${formatMonthDayTime(startAt)} ~ ${formatTimeShort(endAt)}`
    : `${formatMonthDayTime(startAt)} ~ ${formatMonthDayTime(endAt)}`;
}

async function TeacherDashboard({ user }: { user: SessionUser }) {
  const now = new Date();

  const [pendingResult, activeResult, recent, posts] = await Promise.all([
    listPendingPasses(user, now),
    listActivePasses(user, now),
    listRecentAwards(user, { track: "SCHOOL", page: 1 }),
    listRecentPosts(user, 5),
  ]);
  const pending = pendingResult.entries;
  const active = activeResult.entries;

  return (
    <Stack>
      <TeacherStats
        user={user}
        now={now}
        pendingCount={pendingResult.total}
        activeCount={activeResult.total}
      />

      <TwoUp>
        <SectionCard
          headingLevel={3}
          title="결재 대기"
          aside={<CardLink href="/pass">출입증</CardLink>}
          flush
        >
          {pending.length === 0 ? (
            <EmptyState variant="inside">결재할 신청이 없습니다.</EmptyState>
          ) : (
            <SummaryList>
              {pending.slice(0, 5).map((pass) => {
                const enrollment = pass.studentProfile.enrollments[0];
                return (
                  <SummaryRow
                    key={pass.id}
                    href={`/pass/${pass.id}`}
                    title={honorificName(pass.studentProfile.user.name, "STUDENT")}
                    meta={joinMeta(
                      classLabel(
                        enrollment?.grade,
                        enrollment?.classNo,
                        enrollment?.number,
                      ),
                      passTypeLabel(pass.type),
                      windowLabel(pass.startAt, pass.endAt),
                    )}
                    trailing={<PassStatusBadge pass={pass} />}
                  />
                );
              })}
            </SummaryList>
          )}
        </SectionCard>

        <SectionCard
          headingLevel={3}
          title="최근 부여"
          hint="교내 기준"
          aside={<CardLink href="/merit/recent">전체</CardLink>}
          flush
        >
          {recent.entries.length === 0 ? (
            <EmptyState variant="inside">아직 부여한 기록이 없습니다.</EmptyState>
          ) : (
            <SummaryList>
              {recent.entries.slice(0, 5).map((award) => (
                <SummaryRow
                  key={award.id}
                  href={`/merit/students/${award.studentProfileId}`}
                  title={honorificName(award.studentName, "STUDENT")}
                  meta={joinMeta(
                    classLabel(award.grade, award.classNo, award.number),
                    award.label,
                  )}
                  trailing={
                    award.status === "CANCELLED" ? (
                      <Badge tone="cancelled">취소</Badge>
                    ) : (
                      <span
                        className={`text-sm font-medium tabular-nums ${kindColorClass(award.kind)}`}
                      >
                        {signedPoints(award.kind, award.points)}
                      </span>
                    )
                  }
                />
              ))}
            </SummaryList>
          )}
        </SectionCard>
      </TwoUp>

      <TwoUp>
        <SectionCard
          headingLevel={3}
          title="지금 나가 있는 학생"
          aside={<CardLink href="/pass">출입증</CardLink>}
          flush
        >
          {active.length === 0 ? (
            <EmptyState variant="inside">지금 나가 있는 학생이 없습니다.</EmptyState>
          ) : (
            <SummaryList>
              {active.slice(0, 5).map((pass) => {
                const enrollment = pass.studentProfile.enrollments[0];
                return (
                  <SummaryRow
                    key={pass.id}
                    href={`/pass/${pass.id}`}
                    title={honorificName(pass.studentProfile.user.name, "STUDENT")}
                    meta={joinMeta(
                      classLabel(
                        enrollment?.grade,
                        enrollment?.classNo,
                        enrollment?.number,
                      ),
                      pass.destination,
                    )}
                    trailing={
                      <span className="text-caption tabular-nums text-mut">
                        {passEndLabel(pass)}까지
                      </span>
                    }
                  />
                );
              })}
            </SummaryList>
          )}
        </SectionCard>

        <RecentPostsCard posts={posts} />
      </TwoUp>
    </Stack>
  );
}

async function TeacherStats({
  user,
  now,
  pendingCount,
  activeCount,
}: {
  user: SessionUser;
  now: Date;
  pendingCount: number;
  activeCount: number;
}) {
  let awardCount: number | null = null;
  let net: number | null = null;

  try {
    const summary = await getMeritSummary(user, "SCHOOL", now);
    awardCount = summary.totals.awardCount;
    net = summary.totals.net;
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }

  return (
    <StatStrip className="grid-cols-2 @2xl:grid-cols-4">
      <StatTile
        variant="plain"
        label="결재 대기"
        value={`${pendingCount}건`}
        hint="승인·반려를 기다리는 신청"
      />
      <StatTile
        variant="plain"
        label="지금 나가 있는 학생"
        value={`${activeCount}명`}
        hint="유효한 출입증"
      />
      <StatTile
        variant="plain"
        label="부여 건수"
        value={awardCount === null ? "—" : `${awardCount}건`}
        hint={`교내 · 최근 ${SUMMARY_DAYS}일`}
      />
      <StatTile
        variant="plain"
        label="순점수"
        value={net === null ? "—" : signedNet(net)}
        valueClassName={net !== null && net < 0 ? "text-rose" : "text-green"}
        hint={`교내 · 최근 ${SUMMARY_DAYS}일`}
      />
    </StatStrip>
  );
}

async function StudentDashboard({ user }: { user: SessionUser }) {
  const now = new Date();
  const [merit, live, posts] = await Promise.all([
    loadOwnMerit(user),
    getMyLivePasses(user, now),
    listRecentPosts(user, 5),
  ]);

  return (
    <Stack>
      {merit === "no-year" ? (
        <NoAcademicYearNotice title="상벌점" />
      ) : (
        <TwoUp>
          <TrackCard track="SCHOOL" view={merit.school} />
          <TrackCard track="DORM" view={merit.dorm} />
        </TwoUp>
      )}

      <TwoUp>
        <SectionCard
          headingLevel={3}
          title="내 출입증"
          aside={<CardLink href="/pass">전체</CardLink>}
          flush
        >
          {live.length === 0 ? (
            <EmptyState
              variant="inside"
              action={
                <Link href="/pass" className={buttonClass({ size: "sm" })}>
                  외출·외박 신청
                </Link>
              }
            >
              신청한 출입증이 없습니다.
            </EmptyState>
          ) : (
            <SummaryList>
              {live.map((pass) => (
                <SummaryRow
                  key={pass.id}
                  href={`/pass/${pass.id}`}
                  title={`${passTypeLabel(pass.type)} · ${pass.destination}`}
                  meta={windowLabel(pass.startAt, pass.endAt)}
                  trailing={<PassStatusBadge pass={pass} />}
                />
              ))}
            </SummaryList>
          )}
        </SectionCard>

        <RecentPostsCard posts={posts} />
      </TwoUp>
    </Stack>
  );
}

async function loadOwnMerit(
  user: SessionUser,
): Promise<{ school: StudentMeritView; dorm: StudentMeritView } | "no-year"> {
  try {
    const [school, dorm] = await Promise.all([
      getMyMerit(user, "SCHOOL"),
      getMyMerit(user, "DORM"),
    ]);
    return { school, dorm };
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return "no-year";
  }
}

async function ParentDashboard({ user }: { user: SessionUser }) {
  const children = await listMyChildren(user);
  if (children.length === 0) {
    return (
      <Stack>
        <EmptyState>연결된 자녀가 없습니다.</EmptyState>
      </Stack>
    );
  }

  const first = children[0];
  const now = new Date();
  const [merit, waiting] = await Promise.all([
    loadChildMerit(user, first.studentProfileId),
    getMyChildPassesAwaitingConsent(user, now, 5),
  ]);

  return (
    <Stack>
      {merit === "no-year" ? (
        <NoAcademicYearNotice title="상벌점" />
      ) : (
        <>
          <p className="text-caption font-medium text-ink">
            상벌점 · {honorificName(first.name, "STUDENT")}
          </p>

          <TwoUp>
            <TrackCard track="SCHOOL" view={merit.school} />
            <TrackCard track="DORM" view={merit.dorm} />
          </TwoUp>
        </>
      )}

      <SectionCard
        headingLevel={3}
        title="동의 대기"
        hint="모든 자녀 · 외박은 보호자 동의 뒤 결재로 넘어갑니다"
        aside={<CardLink href="/pass">출입증</CardLink>}
        flush
      >
        {waiting.length === 0 ? (
          <EmptyState variant="inside">동의를 기다리는 신청이 없습니다.</EmptyState>
        ) : (
          <SummaryList>
            {waiting.map((pass) => (
              <SummaryRow
                key={pass.id}
                href={`/pass/${pass.id}`}
                title={`${honorificName(
                  pass.studentProfile.user.name,
                  "STUDENT",
                )} · ${passTypeLabel(pass.type)} · ${pass.destination}`}
                meta={windowLabel(pass.startAt, pass.endAt)}
                trailing={<PassStatusBadge pass={pass} />}
              />
            ))}
          </SummaryList>
        )}
      </SectionCard>

      {children.length > 1 && (
        <p className="text-xs text-mut">
          자녀가 여럿입니다.{" "}
          <Link
            href="/merit"
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            상벌점
          </Link>
          에서 골라 봅니다.
        </p>
      )}
    </Stack>
  );
}

async function loadChildMerit(
  user: SessionUser,
  studentProfileId: string,
): Promise<{ school: StudentMeritView; dorm: StudentMeritView } | "no-year"> {
  try {
    const [school, dorm] = await Promise.all([
      getChildMerit(user, studentProfileId, "SCHOOL"),
      getChildMerit(user, studentProfileId, "DORM"),
    ]);
    return { school, dorm };
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return "no-year";
  }
}

function TrackCard({ track, view }: { track: MeritTrack; view: StudentMeritView }) {
  return (
    <SectionCard
      headingLevel={3}
      title={MERIT_TRACK_TITLES[track]}
      hint={
        view.year === null
          ? `${MERIT_TRACK_LABELS[track]}는 입학부터 누적입니다`
          : `${view.year}학년도 · 학년도마다 새로 시작합니다`
      }
      aside={<CardLink href={`/merit?track=${track}`}>내역</CardLink>}
    >
      <MeritTotalsCards totals={view.totals} />
    </SectionCard>
  );
}

function RecentPostsCard({ posts }: { posts: RecentPostView[] }) {
  return (
    <SectionCard
      headingLevel={3}
      title="새 글"
      aside={<CardLink href="/community">커뮤니티</CardLink>}
      flush
    >
      {posts.length === 0 ? (
        <EmptyState variant="inside">아직 올라온 글이 없습니다.</EmptyState>
      ) : (
        <SummaryList>
          {posts.map((post) => (
            <SummaryRow
              key={post.id}
              href={`/community/${post.communitySlug}/${post.id}`}
              title={post.title}
              meta={joinMeta(
                post.communityName,
                post.author?.display,
                formatMonthDay(post.createdAt),
              )}
              trailing={
                post.commentCount > 0 ? (
                  <span className="text-xs tabular-nums text-mut">
                    댓글 {post.commentCount}
                  </span>
                ) : undefined
              }
            />
          ))}
        </SummaryList>
      )}
    </SectionCard>
  );
}
