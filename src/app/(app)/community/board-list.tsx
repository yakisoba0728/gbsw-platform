import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";

export type BoardCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  anonymous: boolean;
  /** 이 사람이 글을 쓸 수 있는가. 못 쓰면 「읽기 전용」 배지가 붙는다. */
  writable: boolean;
};

/**
 * 게시판 목록. **표가 아니라 카드다** — 게시판은 스물을 넘지 않고, 이름·설명·
 * 성질 배지가 한 줄 표에 들어가지 않는다.
 *
 * 카드 전체를 링크로 만들지 않는다 — 안의 배지가 링크 속 링크가 된다.
 */
export function BoardList({ boards }: { boards: readonly BoardCard[] }) {
  return (
    <ul className="grid gap-3 @2xl:grid-cols-2">
      {boards.map((board) => (
        <li key={board.id} className={cardClass("panel")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-ink">
              <Link
                href={`/community/${board.slug}`}
                className="underline decoration-line-strong underline-offset-4 hover:decoration-ink"
              >
                {board.name}
              </Link>
            </h2>
            {board.anonymous && <Badge tone="info">익명</Badge>}
            {!board.writable && <Badge tone="neutral">읽기 전용</Badge>}
          </div>

          {board.description && (
            <p className="mt-1.5 text-sm text-mut">{board.description}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
