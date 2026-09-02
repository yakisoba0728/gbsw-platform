import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { formatDateInput } from "@/lib/datetime";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "출입증 신청" };

export default async function NewPassPage() {
  await requirePermission("pass:request");

  return (
    <div className="@container mx-auto max-w-2xl">
      <BackLink href="/pass">출입증</BackLink>
      <SectionCard title="출입증 신청" variant="panel" className="mt-3">
        <RequestForm today={formatDateInput(new Date())} />
      </SectionCard>
    </div>
  );
}
