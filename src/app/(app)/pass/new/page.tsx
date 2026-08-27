import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { formatDateInput } from "@/lib/datetime";
import { RequestForm } from "./request-form";
import { pageClass } from "@/components/ui/page-shell";

export const metadata: Metadata = { title: "출입증 신청" };

export default async function NewPassPage() {
  // 학생 전용이다. 교사는 /pass의 「바로 부여」를 쓴다.
  await requirePermission("pass:request");

  return (
    <div className={pageClass("form", "@container")}>
      <BackLink href="/pass">출입증</BackLink>
      <SectionCard title="출입증 신청" variant="panel" className="mt-3">
        {/* 날짜 기본값은 서버가 KST로 집는다 — 클라이언트 시계는 다를 수 있다. */}
        <RequestForm today={formatDateInput(new Date())} />
      </SectionCard>
    </div>
  );
}
