import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen, SkeletonTabs } from "@/components/ui/skeleton";

/** `/merit/recent`의 로딩 뼈대 — 트랙·필터를 품은 최근 부여 표. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <div className={cardClass("flush")}>
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Skeleton className="h-5 w-20" />
            <SkeletonTabs size="sm" />
          </div>
          {/* 조작부 배치는 page.tsx의 controls와 같은 값이어야 한다 — 어긋나면
              뼈대가 튄다. */}
          <div className="@container mt-3">
            <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end">
              <div className="space-y-2.5">
                <Skeleton className="h-[38px] w-64 rounded-full lg:h-[30px]" />
                <Skeleton className="h-10 max-w-xl rounded-field" />
              </div>
              <div className="flex items-center justify-end gap-3">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-[38px] w-24 rounded-btn lg:h-[30px]" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
