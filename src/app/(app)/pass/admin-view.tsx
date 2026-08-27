import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatTile } from "@/components/ui/stat-tile";
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

export async function AdminView({ actor }: { actor: SessionUser }) {
  const now = new Date();
  // 셋은 서로를 안 기다린다.
  const [pending, active, students] = await Promise.all([
    listPendingPasses(actor, now),
    listActivePasses(actor, now),
    listStudentsForIssue(actor),
  ]);

  return (
    <div className="@container mx-auto max-w-5xl space-y-4">
      <div className="grid gap-4 @2xl:grid-cols-2">
        <StatTile label="결재 대기" value={`${pending.length}건`} />
        <StatTile label="지금 나가 있는 학생" value={`${active.length}명`} />
      </div>

      <div className="grid gap-4 @4xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SectionCard
            title="결재 대기"
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
                  QR 스캔하기
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

          <SectionCard title="지금 나가 있는 학생" flush>
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

function seatOf(pass: {
  studentProfile: {
    enrollments: {
      number: number | null;
      schoolClass: { grade: number; classNo: number } | null;
    }[];
  };
}) {
  const enrollment = pass.studentProfile.enrollments[0];
  return {
    grade: enrollment?.schoolClass?.grade ?? null,
    classNo: enrollment?.schoolClass?.classNo ?? null,
    number: enrollment?.number ?? null,
  };
}
