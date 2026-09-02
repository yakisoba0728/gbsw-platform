import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/core/auth/session";
import { listReadableWithActivity } from "@/modules/community/board.service";
import { canWrite } from "@/modules/community/community.access";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "커뮤니티" };

export default async function CommunityPage() {
  const actor = await requireAuth();
  const boards = await listReadableWithActivity(actor);

  if (boards.length === 0) {
    return <EmptyState>볼 수 있는 게시판이 없습니다.</EmptyState>;
  }

  return (
    <div className="@container mx-auto max-w-5xl">
      <BoardList
        boards={boards.map((board) => ({
          id: board.id,
          slug: board.slug,
          name: board.name,
          description: board.description,
          anonymous: board.anonymous,
          writable: canWrite(actor, board),
          postCount: board.postCount,
          lastPostAt: board.lastPostAt,
        }))}
      />
    </div>
  );
}
