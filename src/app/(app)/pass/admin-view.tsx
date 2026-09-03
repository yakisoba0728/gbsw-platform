import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { honorificName } from "@/core/authz/roles";
import { formatDateInput } from "@/lib/datetime";
import { formatSeat } from "@/lib/student-number";
import {
  listActivePasses,
  listPendingPasses,
  listStudentsForIssue,
} from "@/modules/pass/decision.service";
import { requiresConsent } from "@/modules/pass/pass.policy";
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

      <div className="grid gap-4 @4xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SectionCard
            title="결재 대기"
            hint={countHint(pending.length, pendingResult.total, "건")}
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
