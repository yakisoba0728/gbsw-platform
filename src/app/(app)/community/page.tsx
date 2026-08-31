import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/core/auth/session";
import { listReadableWithActivity } from "@/modules/community/board.service";
import { canWrite } from "@/modules/community/community.access";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "커뮤니티" };

export default async function CommunityPage() {
  const actor = await requireAuth();
  // 서비스가 권한을 판정한다 — 못 읽는 게시판은 이름도 안 나온다.
  const boards = await listReadableWithActivity(actor);

  if (boards.length === 0) {
    // 카드 밖(페이지 본문)에 바로 서는 자리라 자기 테두리를 그린다.
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
          // 배지를 그릴지 정하는 일이라 순수 함수를 직접 쓴다 — 거부 기록이
          // 필요 없다. 실제 통제는 글쓰기 경로가 한다.
          writable: canWrite(actor, board),
          postCount: board.postCount,
          lastPostAt: board.lastPostAt,
        }))}
      />
    </div>
  );
}
