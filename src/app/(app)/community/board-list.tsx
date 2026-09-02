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
  writable: boolean;
  postCount: number;
  lastPostAt: Date | null;
};

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
