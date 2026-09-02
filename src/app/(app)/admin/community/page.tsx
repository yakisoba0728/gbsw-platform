import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { requirePermission } from "@/core/auth/session";
import { listForManage } from "@/modules/community/board.service";
import { CommunityForm } from "./community-form";
import { CommunityList } from "./community-list";

export const metadata: Metadata = { title: "커뮤니티 관리" };

export default async function AdminCommunityPage() {
  const actor = await requirePermission("community:manage");
  const boards = await listForManage(actor);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CommunityForm />

      <SectionCard
        title="게시판 목록"
        aside={<span className="text-xs text-mut">{boards.length}개</span>}
        flush
      >
        {boards.length === 0 ? (
          <EmptyState variant="inside">아직 게시판이 없습니다.</EmptyState>
        ) : (
          <CommunityList boards={boards} />
        )}
      </SectionCard>
    </div>
  );
}
