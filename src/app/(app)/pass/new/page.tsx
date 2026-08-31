import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { formatDateInput } from "@/lib/datetime";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "출입증 신청" };

export default async function NewPassPage() {
  // 학생 전용이다. 교사는 /pass의 「바로 부여」를 쓴다.
  await requirePermission("pass:request");

  return (
    <PageScaffold
      eyebrow={<BackLink href="/pass">출입증으로 돌아가기</BackLink>}
      title="외출·외박 신청"
      description="시간과 행선지를 정확히 입력하면 보호자 확인과 선생님 결재가 이어집니다."
      width="form"
    >
      <div className="@container">
      <SectionCard title="신청 내용" variant="panel">
        {/* 날짜 기본값은 서버가 KST로 집는다 — 클라이언트 시계는 다를 수 있다. */}
        <RequestForm today={formatDateInput(new Date())} />
      </SectionCard>
      </div>
    </PageScaffold>
  );
}
