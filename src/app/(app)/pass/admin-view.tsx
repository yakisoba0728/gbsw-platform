import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageScaffold } from "@/components/ui/page-scaffold";
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

export async function AdminView({ actor }: { actor: SessionUser }) {
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
    <PageScaffold
      eyebrow="출입 관리"
      title="출입증 운영"
      description="결재 대기 신청과 현재 교외에 있는 학생을 확인하고 출입증을 바로 부여합니다."
      width="data"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/pass/history"
            className={buttonClass({ variant: "secondary" })}
          >
            전체 내역
          </Link>
          <Link href="/scan" className={buttonClass()}>
            QR 스캔
          </Link>
        </div>
      }
    >
      <div className="@container">
      {/*
       * 합계 칸 둘을 뺐다. 「결재 대기 0건」이라 적힌 상자 바로 아래에 「결재
       * 대기」 카드가 서고 그 안에 다시 「결재할 신청이 없습니다」가 있어서,
       * 같은 사실이 한 화면에 세 번 적혔다. 건수는 카드 제목 옆이 제자리다 —
       * 목록과 같은 것을 세는 숫자라 목록에서 떨어져 있을 이유가 없다.
       */}
      <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div className="space-y-5 lg:space-y-6">
          <SectionCard
            title="결재 대기"
            hint={`${pendingResult.total}건`}
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
            hint={`${activeResult.total}명`}
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
    </PageScaffold>
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
