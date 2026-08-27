import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/community/[slug]/[postId]`의 뼈대 — 글 본문 + 댓글. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-3xl space-y-4">
      <div className={cardClass("page")}>
        <Skeleton className="h-7 w-2/3 rounded-btn" />
        <Skeleton className="mt-2 h-4 w-40 rounded-btn" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 rounded-btn" />
          ))}
        </div>
      </div>

      <div className={cardClass("flush")}>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-16 rounded-btn" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
