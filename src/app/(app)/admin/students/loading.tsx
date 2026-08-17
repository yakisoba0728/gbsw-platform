import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/admin/students`의 뼈대 — 명단 반영 링크 · 학년도 카드 · 학생 표. */
export default function Loading() {
  return (
    <SkeletonScreen className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Skeleton className="h-4 w-24 rounded-btn" />
      </div>

      {/* 학년도 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <Skeleton className="h-5 w-16 rounded-btn" />
        <Skeleton className="mt-2 h-4 w-56 rounded-btn" />
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Skeleton className="h-11 w-56 rounded-field" />
          <Skeleton className="h-11 w-50 rounded-field" />
        </div>
      </div>

      {/* 학생 표 */}
      <div className="rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-16 rounded-btn" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-2.5 h-11 rounded-field" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
