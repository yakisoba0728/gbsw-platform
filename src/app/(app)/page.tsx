import Link from "next/link";
import type { ReactNode } from "react";
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
  PASS_STATUS_LABELS,
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
import { PASS_STATUS_TONES } from "@/modules/pass/pass.labels";
import { getMyChildPasses, getMyPasses } from "@/modules/pass/request.service";

/**
 * 대시보드.
 *
 * **여기는 지금 해야 할 일이 있는 자리다.** 예전에는 합계 카드 둘만 두고
 * "목록도 바로가기도 여기서 다시 만들지 않는다"고 못박았는데, 그 결과 화면을
 * 열면 숫자 넷과 빈 바닥이 남았다 — 교사가 아침에 처음 여는 화면이 「결재할
 * 것이 있는지」를 답하지 못하고, 답을 얻으려면 사이드바에서 출입증을 눌러
 * 들어가야 했다. 합계는 그날의 상태고, 목록은 그날의 일이다. 둘 다 필요하다.
 *
 * 대신 규칙을 둔다: **이 화면은 아무것도 바꾸지 않는다.** 승인·반려·부여
 * 버튼은 여기 두지 않고 제 화면으로 보낸다. 한 건을 처리하러 온 사람이
 * 나머지 목록을 못 보고 돌아가는 일이 없게, 판단은 늘 전체가 보이는 곳에서 한다.
 */
export default async function DashboardPage() {
  const user = await requireAuth();

  if (can(user, "merit:read:any")) return <TeacherDashboard user={user} />;
  if (user.role === "PARENT") return <ParentDashboard user={user} />;
  return <StudentDashboard user={user} />;
}

/** 대시보드의 세로 간격. 카드마다 적으면 화면끼리 어긋난다. */
function Stack({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl space-y-4">{children}</div>;
}

/** 카드 두 장을 나란히. 뷰포트가 아니라 놓인 자리의 폭을 본다. */
function TwoUp({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      {/* items-start — 격자 기본값(stretch)이면 짧은 카드가 옆의 긴 카드 높이까지
          늘어난다. 「신청이 없습니다」 한 줄이 320px 상자 한가운데 뜨는 그림이
          그것이었다. 카드는 제 내용만큼만 선다. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @3xl:grid-cols-2">
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

/** 「1-3 7번」. 재적이 없는 학생은 학급이 없다 — 그 자리를 지어내지 않는다. */
function classLabel(
  grade: number | null | undefined,
  classNo: number | null | undefined,
  number: number | null | undefined,
): string | null {
  if (grade == null || classNo == null) return null;
  return number == null ? `${grade}-${classNo}` : `${grade}-${classNo} ${number}번`;
}

/**
 * 유형·상태는 DB에서 문자열로 온다(Prisma 스키마가 enum이 아니다). 표를 바로
 * 색인하면 타입이 막고, 억지로 캐스팅하면 언젠가 모르는 값이 화면에 라벨 대신
 * 빈칸으로 뜬다 — 모르는 값은 그 값 그대로 보여준다.
 */
function passTypeLabel(value: string): string {
  return isPassType(value) ? PASS_TYPE_LABELS[value] : value;
}

/** 상태 배지. 모르는 상태는 중립으로 그린다. */
function PassStatusBadge({ status }: { status: string }) {
  if (!isPassStatus(status)) return <Badge tone="neutral">{status}</Badge>;
  return <Badge tone={PASS_STATUS_TONES[status]}>{PASS_STATUS_LABELS[status]}</Badge>;
}

/** 보조 줄을 「·」로 잇는다. 없는 조각은 빠지고 구분점도 함께 빠진다. */
function joinMeta(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** 「8. 30. 14:00 ~ 18:00」. 날이 넘어가면 뒤쪽도 날짜를 적는다. */
function windowLabel(startAt: Date, endAt: Date): string {
  const sameDay = formatMonthDay(startAt) === formatMonthDay(endAt);
  return sameDay
    ? `${formatMonthDayTime(startAt)} ~ ${formatTimeShort(endAt)}`
    : `${formatMonthDayTime(startAt)} ~ ${formatMonthDayTime(endAt)}`;
}

// ── 교사 ────────────────────────────────────────────────────────

async function TeacherDashboard({ user }: { user: SessionUser }) {
  // 한 화면이 한 순간을 본다. 칸마다 new Date()를 만들면 자정을 끼고 「대기 3건」
  // 옆에 두 건짜리 목록이 선다.
  const now = new Date();

  const [pending, active, recent, posts] = await Promise.all([
    listPendingPasses(user, now),
    listActivePasses(user, now),
    listRecentAwards(user, { track: "SCHOOL", page: 1 }),
    listRecentPosts(user, 5),
  ]);

  return (
    <Stack>
      <TeacherStats
        user={user}
        now={now}
        pendingCount={pending.length}
        activeCount={active.length}
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
                        enrollment?.schoolClass?.grade,
                        enrollment?.schoolClass?.classNo,
                        enrollment?.number,
                      ),
                      passTypeLabel(pass.type),
                      windowLabel(pass.startAt, pass.endAt),
                    )}
                    trailing={<PassStatusBadge status={pass.status} />}
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
                        className={
                          award.kind === "DEMERIT"
                            ? "text-sm font-medium tabular-nums text-rose"
                            : "text-sm font-medium tabular-nums text-blue"
                        }
                      >
                        {award.kind === "DEMERIT" ? "−" : "+"}
                        {award.points}
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
                        enrollment?.schoolClass?.grade,
                        enrollment?.schoolClass?.classNo,
                        enrollment?.number,
                      ),
                      pass.destination,
                    )}
                    trailing={
                      <span className="text-caption tabular-nums text-mut">
                        {formatTimeShort(pass.endAt)} 복귀
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

/**
 * 교사가 처음 보는 네 숫자.
 *
 * 앞의 둘은 **지금 처리할 일**이고 뒤의 둘은 **최근 이레의 흐름**이다. 둘이
 * 한 띠에 서므로 성질이 다르다는 것을 라벨이 말해야 한다 — 「최근 7일」을
 * 뒤쪽 두 칸의 밑줄에 적는다.
 */
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
    // 학년도가 없으면 상벌점 두 칸이 성립하지 않는다. 출입증 두 칸은 학년도와
    // 무관하게 선다 — 띠 전체를 지우면 결재 대기가 몇 건인지도 사라진다.
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

// ── 학생 ────────────────────────────────────────────────────────

async function StudentDashboard({ user }: { user: SessionUser }) {
  const [merit, passes, posts] = await Promise.all([
    loadOwnMerit(user),
    getMyPasses(user),
    listRecentPosts(user, 5),
  ]);

  if (merit === "no-year") {
    return (
      <Stack>
        <NoAcademicYearNotice title="상벌점" />
      </Stack>
    );
  }

  // 아직 안 끝난 것만. 지난 외출을 대시보드에 세우면 「지금 무엇이 유효한가」가
  // 흐려진다 — 지난 것은 출입증 화면의 내역이 갖는다.
  const now = new Date();
  const live = passes.filter(
    (pass) =>
      pass.endAt.getTime() > now.getTime() &&
      pass.status !== "REJECTED" &&
      pass.status !== "CANCELLED" &&
      pass.status !== "WITHDRAWN",
  );

  return (
    <Stack>
      <TwoUp>
        <TrackCard track="SCHOOL" view={merit.school} />
        <TrackCard track="DORM" view={merit.dorm} />
      </TwoUp>

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
              {live.slice(0, 5).map((pass) => (
                <SummaryRow
                  key={pass.id}
                  href={`/pass/${pass.id}`}
                  title={`${passTypeLabel(pass.type)} · ${pass.destination}`}
                  meta={windowLabel(pass.startAt, pass.endAt)}
                  trailing={<PassStatusBadge status={pass.status} />}
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

/** 학년도가 없으면 상벌점이 성립하지 않는다 — 두 트랙을 한 번에 가른다. */
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

// ── 학부모 ──────────────────────────────────────────────────────

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
  const [merit, passes] = await Promise.all([
    loadChildMerit(user, first.studentProfileId),
    getMyChildPasses(user),
  ]);

  if (merit === "no-year") {
    return (
      <Stack>
        <NoAcademicYearNotice title="상벌점" />
      </Stack>
    );
  }

  // 학부모가 이 화면에서 답해야 하는 것은 「내가 동의할 것이 있나」다.
  const waiting = passes.filter((pass) => pass.status === "REQUESTED");

  return (
    <Stack>
      <p className="text-caption font-medium text-ink">
        {honorificName(first.name, "STUDENT")}
      </p>

      <TwoUp>
        <TrackCard track="SCHOOL" view={merit.school} />
        <TrackCard track="DORM" view={merit.dorm} />
      </TwoUp>

      <SectionCard
        headingLevel={3}
        title="동의 대기"
        hint="외박은 보호자 동의가 있어야 결재로 넘어갑니다"
        aside={<CardLink href="/pass">출입증</CardLink>}
        flush
      >
        {waiting.length === 0 ? (
          <EmptyState variant="inside">동의를 기다리는 신청이 없습니다.</EmptyState>
        ) : (
          <SummaryList>
            {waiting.slice(0, 5).map((pass) => (
              <SummaryRow
                key={pass.id}
                href={`/pass/${pass.id}`}
                title={`${passTypeLabel(pass.type)} · ${pass.destination}`}
                meta={windowLabel(pass.startAt, pass.endAt)}
                trailing={<PassStatusBadge status={pass.status} />}
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

// ── 함께 쓰는 카드 ───────────────────────────────────────────────

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

/** 읽을 수 있는 게시판을 가로지르는 최근 글. 익명 게시판이면 작성자가 없다. */
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
