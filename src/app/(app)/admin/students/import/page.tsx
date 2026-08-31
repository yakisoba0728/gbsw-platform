import type { Metadata } from "next";
import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { requirePermission } from "@/core/auth/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "명단 반영" };

export default async function StudentsImportPage() {
  await requirePermission("student:manage");

  return (
    <PageScaffold
      width="data"
      eyebrow={<BackLink href="/admin/users?tab=students">학생 명단</BackLink>}
      title="명단 반영"
      description="엑셀 명단을 검토한 뒤 현재 학년도 재적 정보에 반영합니다."
    >
      <ImportForm />
    </PageScaffold>
  );
}
