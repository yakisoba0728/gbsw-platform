import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { requiresConsent } from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { formatDateInput } from "@/lib/datetime";
import { formatSeat } from "@/lib/student-number";
import {
  listActivePasses,
  listPendingPasses,
  listStudentsForIssue,
} from "@/modules/pass/decision.service";
import { CancelButton } from "./cancel-button";
import { DecisionPanel } from "./decision-panel";
import { IssueForm } from "./issue-form";
import { PassCard, passEndLabel } from "./pass-card";

export async function AdminView({
  actor,
  approved,
}: {
  actor: SessionUser;
  approved: boolean;
}) {
  const now = new Date();
  // 셋은 서로를 안 기다린다.
  const [pendingResult, activeResult, students] = await Promise.all([
    listPendingPasses(actor, now),
    listActivePasses(actor, now),
    listStudentsForIssue(actor),
  ]);
  const pending = pendingResult.entries;
  const active = activeResult.entries;

  return (
    <div className="@container mx-auto max-w-5xl space-y-4">
      {approved && (
        <Note tone="success" role="status">
          출입증을 승인했습니다. 학생은 정해진 기간에 발급된 출입증을 사용할 수
          있습니다.
        </Note>
      )}

      {/*
       * 합계 칸 둘을 뺐다. 「결재 대기 0건」이라 적힌 상자 바로 아래에 「결재
       * 대기」 카드가 서고 그 안에 다시 「결재할 신청이 없습니다」가 있어서,
       * 같은 사실이 한 화면에 세 번 적혔다. 건수는 카드 제목 옆이 제자리다 —
       * 목록과 같은 것을 세는 숫자라 목록에서 떨어져 있을 이유가 없다.
       */}
      <div className="grid gap-4 @4xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SectionCard
            title="결재 대기"
            hint={countHint(pending.length, pendingResult.total, "건")}
            aside={
              // 이 카드도 아래 카드도 「지금」만 답한다 — 어제 나간 것을 되짚을
              // 길은 전체 내역뿐이라 결재 대기 옆에 세운다.
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
              <EmptyState variant="inside">결재할 신청이 없습니다.</EmptyState>
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
          </SectionCard>

          <SectionCard
            title="지금 나가 있는 학생"
            hint={countHint(active.length, activeResult.total, "명")}
            flush
          >
            {active.length === 0 ? (
              <EmptyState variant="inside">
                지금 나가 있는 학생이 없습니다.
              </EmptyState>
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

function countHint(visible: number, total: number, unit: "건" | "명"): string {
  return visible < total
    ? `${visible}${unit} 표시 / 전체 ${total}${unit}`
    : `${total}${unit}`;
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
