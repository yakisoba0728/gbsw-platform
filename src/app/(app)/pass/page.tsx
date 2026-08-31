import type { Metadata } from "next";
import { headers } from "next/headers";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { requireAuth } from "@/core/auth/session";
import {
  PASS_FLASH_HEADER,
  verifyPassFlash,
} from "@/modules/pass/pass-flash";
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
  const raw = await searchParams;
  const parsed = passHistoryQuerySchema.safeParse(raw);
  const page = parsed.success ? parsed.data.page : 1;
  const token = (await headers()).get(PASS_FLASH_HEADER);
  const flash = verifyPassFlash(token);
  const notice = flash?.userId === actor.id ? flash.kind : null;

  if (actor.role === "ADMIN") {
    return <AdminView actor={actor} approved={notice === "approved"} />;
  }
  if (actor.role === "STUDENT") {
    return (
      <StudentView
        actor={actor}
        page={page}
        requested={notice === "requested"}
      />
    );
  }
  if (actor.role === "PARENT") {
    return (
      <ParentView
        actor={actor}
        page={page}
        consented={notice === "consented"}
      />
    );
  }

  return (
    <SectionCard title="출입증" className="mx-auto max-w-3xl" variant="panel">
      <EmptyState variant="inside">이 계정에서는 쓸 수 없습니다.</EmptyState>
    </SectionCard>
  );
}
