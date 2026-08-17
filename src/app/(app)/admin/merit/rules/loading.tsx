import { Skeleton, SkeletonScreen, SkeletonTabs } from "@/components/ui/skeleton";

/** `/admin/merit/rules`의 뼈대 — 트랙 탭 · 규정 추가 폼 · 검색/종류 필터 · 규정 표. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <SkeletonTabs />

      {/* 규정 추가 */}
      <div className="rounded-card border border-line bg-surface p-5">
        <Skeleton className="h-4 w-20 rounded-btn" />
        <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
          <Skeleton className="h-[70px] min-w-[180px] flex-[2] rounded-field" />
          <Skeleton className="h-[70px] min-w-[100px] flex-1 rounded-field" />
          <Skeleton className="h-[70px] w-[90px] rounded-field" />
          <Skeleton className="h-[70px] min-w-[110px] flex-1 rounded-field" />
          <Skeleton className="h-[70px] min-w-[160px] flex-[2] rounded-field" />
        </div>
      </div>

      {/* 검색 + 종류 필터 */}
      <div className="rounded-card border border-line bg-surface p-4">
        <Skeleton className="h-11 rounded-field" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-3 h-4 w-16 rounded-btn" />
      </div>

      {/* 규정 표 */}
      <div className="rounded-card border border-line bg-surface">
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
