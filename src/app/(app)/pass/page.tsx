import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import { AdminView } from "./admin-view";
import { ParentView } from "./parent-view";
import { StudentView } from "./student-view";
import { pageClass } from "@/components/ui/page-shell";

export const metadata: Metadata = { title: "출입증" };

/** 역할로 갈린다 — merit과 같은 모양이다. 접근 통제는 각 뷰의 서비스가 한다. */
export default async function PassPage() {
  const actor = await requireAuth();

  if (actor.role === "ADMIN") return <AdminView actor={actor} />;
  if (actor.role === "STUDENT") return <StudentView actor={actor} />;
  if (actor.role === "PARENT") return <ParentView actor={actor} />;

  return (
    <SectionCard title="출입증" className={pageClass("form")} variant="panel">
      <EmptyState variant="inside">이 계정에서는 쓸 수 없습니다.</EmptyState>
    </SectionCard>
  );
}
