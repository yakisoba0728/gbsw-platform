import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/admin/logs`의 뼈대. 동작 필터는 쌓인 동작 수만큼 생겨 두 줄까지 간다 —
 * 뼈대에서도 두 줄을 그려야 표가 위로 안 튄다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl">
      <div className={cardClass("flush")}>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-24 rounded-btn" />
          <SkeletonTabs count={14} size="sm" width="w-20" className="mt-3 flex-wrap" />
          <SkeletonField size="sm" className="mt-2.5" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
