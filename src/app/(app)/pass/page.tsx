import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { passHistoryQuerySchema } from "@/modules/pass/pass.schema";
import { AdminView } from "./admin-view";
import { ParentView } from "./parent-view";
import { StudentView } from "./student-view";

export const metadata: Metadata = { title: "출입증" };

/** 역할로 갈린다 — merit과 같은 모양이다. 접근 통제는 각 뷰의 서비스가 한다. */
export default async function PassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const parsed = passHistoryQuerySchema
    .pick({ page: true })
    .safeParse(await searchParams);
  const page = parsed.success ? parsed.data.page : 1;

  if (actor.role === "ADMIN") return <AdminView actor={actor} />;
  if (actor.role === "STUDENT") return <StudentView actor={actor} page={page} />;
  if (actor.role === "PARENT") return <ParentView actor={actor} page={page} />;

  return (
    <PageScaffold
      eyebrow="출입 관리"
      title="출입증"
      description="이 계정에는 출입증 업무 권한이 없습니다."
      width="form"
    >
      <SectionCard title="이용 안내" variant="panel">
        <EmptyState variant="inside">이 계정에서는 쓸 수 없습니다.</EmptyState>
      </SectionCard>
    </PageScaffold>
  );
}
