import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/admin/users`의 뼈대 — 머리글 + 상태·역할 칩 + 검색칸 + 표. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl">
      <div className="rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-20 rounded-btn" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-2.5 h-11 rounded-field" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
