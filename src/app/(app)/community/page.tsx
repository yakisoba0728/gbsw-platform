import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { requireAuth } from "@/core/auth/session";
import { listReadableWithActivity } from "@/modules/community/board.service";
import { canWrite } from "@/modules/community/community.access";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "커뮤니티" };

export default async function CommunityPage() {
  const actor = await requireAuth();
  // 서비스가 권한을 판정한다 — 못 읽는 게시판은 이름도 안 나온다.
  const boards = await listReadableWithActivity(actor);

  return (
    <PageScaffold
      eyebrow="학교 소통"
      title="커뮤니티"
      description="공지와 학교생활 이야기를 게시판별로 확인하세요."
      width="data"
    >
      <div className="@container">
        {boards.length === 0 ? (
          <EmptyState>볼 수 있는 게시판이 없습니다.</EmptyState>
        ) : (
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
        )}
      </div>
    </PageScaffold>
  );
}
