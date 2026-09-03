import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { honorificName } from "@/core/authz/roles";
import { formatDateInput } from "@/lib/datetime";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";
import { formatSeat } from "@/lib/student-number";
import {
  listActivePasses,
  listPendingPasses,
  listStudentsForIssue,
} from "@/modules/pass/decision.service";
import { requiresConsent } from "@/modules/pass/pass.policy";
import {
  PASS_ADMIN_CURSOR_DEPTH,
  PASS_ADMIN_PAGE_SIZE,
  PASS_CURSOR_SEPARATOR,
} from "@/modules/pass/pass.schema";
import { CancelButton } from "./cancel-button";
import { CursorNav } from "./cursor-nav";
import { DecisionPanel } from "./decision-panel";
import { IssueForm } from "./issue-form";
import { PassCard, passEndLabel } from "./pass-card";

const PATH = "/pass";

type CursorKey = "pendingCursor" | "activeCursor";

export async function AdminView({
  actor,
  approved,
  pendingCursors,
  activeCursors,
}: {
  actor: SessionUser;
  approved: boolean;
  pendingCursors: string[];
  activeCursors: string[];
}) {
  const now = new Date();
  const [pendingResult, activeResult, students] = await Promise.all([
    listPendingPasses(actor, now, pendingCursors.at(-1) ?? null),
    listActivePasses(actor, now, activeCursors.at(-1) ?? null),
    listStudentsForIssue(actor),
  ]);
  const pending = pendingResult.entries;
  const active = activeResult.entries;

  // 두 목록은 주소의 서로 다른 파라미터를 쓴다 — 한쪽을 넘겨도 다른 쪽은 보던 자리에 남는다.
  const params: SearchParamsInput = {
    ...trailParam("pendingCursor", pendingCursors),
    ...trailParam("activeCursor", activeCursors),
  };
  const pendingPage = cursorLinks(
    "pendingCursor",
    params,
    pendingCursors,
    pendingResult.nextCursor,
  );
  const activePage = cursorLinks(
    "activeCursor",
    params,
    activeCursors,
    activeResult.nextCursor,
  );

  return (
    <div className="@container mx-auto max-w-5xl space-y-4">
      {approved && (
        <Note tone="success" role="status">
          출입증을 승인했습니다. 학생은 정해진 기간에 발급된 출입증을 사용할 수
          있습니다.
        </Note>
      )}

      <div className="grid gap-4 @4xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SectionCard
            title="결재 대기"
            hint={countHint(
              pendingPage.offset,
              pending.length,
              pendingResult.total,
              "건",
            )}
            aside={
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/pass/history"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  전체 내역
                </Link>
                <Link
                  href="/scan"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  스캔
                </Link>
              </div>
            }
            flush
          >
            {pending.length === 0 ? (
              <PageEmptyState first={pendingPage.offset > 0 ? pendingPage.first : null}>
                결재할 신청이 없습니다.
              </PageEmptyState>
            ) : (
              <ul>
                {pending.map((pass) => (
                  <PassCard key={pass.id} pass={pass}>
                    <p className="text-caption text-mut">
                      {formatSeat(seatOf(pass)) ?? "미배정"}{" "}
                      {honorificName(pass.studentProfile.user.name, "STUDENT")}
                    </p>
                    <DecisionPanel
                      passId={pass.id}
                      needsProxyConsent={
                        requiresConsent(pass.type) &&
                        pass.consentedAt === null &&
                        !pass.consentByProxy
                      }
                    />
                  </PassCard>
                ))}
              </ul>
            )}

            <CursorNav
              label="결재 대기 페이지"
              prev={pendingPage.prev}
              next={pendingPage.next}
            />
          </SectionCard>

          <SectionCard
            title="지금 나가 있는 학생"
            hint={countHint(
              activePage.offset,
              active.length,
              activeResult.total,
              "명",
            )}
            flush
          >
            {active.length === 0 ? (
              <PageEmptyState first={activePage.offset > 0 ? activePage.first : null}>
                지금 나가 있는 학생이 없습니다.
              </PageEmptyState>
            ) : (
              <ul>
                {active.map((pass) => (
                  <PassCard key={pass.id} pass={pass}>
                    <div className="text-right">
                      <p className="text-caption text-mut tabular-nums">
                        {passEndLabel(pass)}까지
                      </p>
                      <CancelButton passId={pass.id} />
                    </div>
                  </PassCard>
                ))}
              </ul>
            )}

            <CursorNav
              label="지금 나가 있는 학생 페이지"
              prev={activePage.prev}
              next={activePage.next}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="바로 부여"
          hint="신청 없이 지금부터 내보냅니다."
          variant="panel"
        >
          <IssueForm students={students} today={formatDateInput(now)} />
        </SectionCard>
      </div>
    </div>
  );
}

/* 지나온 커서가 없으면 파라미터 자체를 붙이지 않는다 — 첫 페이지 주소는 /pass다. */
function trailParam(key: CursorKey, trail: string[]): SearchParamsInput {
  return trail.length > 0 ? { [key]: trail.join(PASS_CURSOR_SEPARATOR) } : {};
}

type CursorLinks = {
  first: string;
  prev: string | null;
  next: string | null;
  offset: number;
};

/* 자취의 맨 뒤가 지금 페이지의 커서다 — 「다음」은 하나를 더하고 「이전」은 하나를 버린다.
   페이지는 커서가 있을 때만 나오므로 앞 페이지는 모두 가득 차 있고, 자취의 길이가
   곧 지금 페이지의 시작 번호가 된다. */
function cursorLinks(
  key: CursorKey,
  params: SearchParamsInput,
  trail: string[],
  nextCursor: string | null,
): CursorLinks {
  const href = (value: string | null) => hrefWith(PATH, params, { [key]: value });
  const back = trail.slice(0, -1);

  return {
    first: href(null),
    prev:
      trail.length === 0
        ? null
        : href(back.length > 0 ? back.join(PASS_CURSOR_SEPARATOR) : null),
    // 자취가 한도에 닿으면 「다음」을 내린다 — 한도를 넘긴 주소는 첫 페이지로
    // 떨어지므로, 링크를 남겨 두면 누른 사람이 처음으로 튕긴다.
    next:
      nextCursor && trail.length < PASS_ADMIN_CURSOR_DEPTH
        ? href([...trail, nextCursor].join(PASS_CURSOR_SEPARATOR))
        : null,
    offset: trail.length * PASS_ADMIN_PAGE_SIZE,
  };
}

/* 첫 페이지의 빈 문구는 그대로 두고, 지나간 커서가 가리키는 페이지가 비었으면
   (그새 다 결재되었거나 주소를 손으로 고쳤다) 돌아갈 길을 함께 준다. */
function PageEmptyState({
  first,
  children,
}: {
  first: string | null;
  children: React.ReactNode;
}) {
  if (!first) return <EmptyState variant="inside">{children}</EmptyState>;

  return (
    <EmptyState
      variant="inside"
      action={
        <Link
          href={first}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          처음으로
        </Link>
      }
    >
      이 페이지에 남은 항목이 없습니다.
    </EmptyState>
  );
}

function countHint(
  offset: number,
  visible: number,
  total: number,
  unit: "건" | "명",
): string {
  if (visible === 0 || (offset === 0 && visible >= total)) {
    return `${total}${unit}`;
  }
  return `${offset + 1}~${offset + visible}번째 / 전체 ${total}${unit}`;
}

function seatOf(pass: {
  studentProfile: {
    enrollments: {
      grade: number | null;
      classNo: number | null;
      number: number | null;
    }[];
  };
}) {
  const enrollment = pass.studentProfile.enrollments[0];
  return {
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
  };
}
