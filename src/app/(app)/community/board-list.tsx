import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import { formatMonthDay } from "@/lib/datetime";

export type BoardCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  anonymous: boolean;
  /** 이 사람이 글을 쓸 수 있는가. 못 쓰면 「읽기 전용」 배지가 붙는다. */
  writable: boolean;
  postCount: number;
  lastPostAt: Date | null;
};

/**
 * 게시판 목록. **표가 아니라 카드다** — 게시판은 스물을 넘지 않고, 이름·설명·
 * 성질 배지가 한 줄 표에 들어가지 않는다.
 *
 * **글 수와 마지막 글을 함께 적는다.** 이름과 설명만 있으면 카드 셋이 똑같이
 * 생겨서, 어디에 들어가야 새 글이 있는지 눌러 보기 전에는 알 수 없었다.
 *
 * 카드 전체가 링크다 — 겹쳐 놓은 빈 링크가 카드를 덮고, 배지·잔글씨는 그
 * 위에 그대로 남는다(제목만 링크로 두면 표적이 글자 폭만큼 좁다). 배지가
 * 링크 속 링크가 되는 문제는 이 방식에는 없다: 배지는 링크 안에 없다.
 */
export function BoardList({ boards }: { boards: readonly BoardCard[] }) {
  return (
    <ul className="grid gap-3 @2xl:grid-cols-2">
      {boards.map((board) => (
        <li
          key={board.id}
          className={cardClass(
            "panel",
            "group relative transition-colors hover:border-line-strong",
          )}
        >
          <Link
            href={`/community/${board.slug}`}
            className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
          >
            <span className="sr-only">{board.name}</span>
          </Link>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-ink">{board.name}</h2>
            {board.anonymous && <Badge tone="info">익명</Badge>}
            {!board.writable && <Badge tone="neutral">읽기 전용</Badge>}
          </div>

          {board.description && (
            <p className="mt-1.5 text-sm text-mut">{board.description}</p>
          )}

          <p className="mt-3 text-xs text-mut2 tabular-nums">
            글 {board.postCount}
            {board.lastPostAt && (
              <>
                <span className="mx-1.5" aria-hidden>
                  ·
                </span>
                마지막 {formatMonthDay(board.lastPostAt)}
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
