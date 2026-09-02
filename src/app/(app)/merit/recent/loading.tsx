import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonField,
  SkeletonRows,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen>
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-6 w-24" />
          <SkeletonTabs size="sm" />
        </div>

        <div className="@container mt-4 space-y-2.5">
          <SkeletonTabs count={4} size="sm" className="flex-wrap" />
          <SkeletonTabs count={3} size="sm" className="flex-wrap" />

          <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
            <SkeletonField size="sm" className="max-w-xl" />
            <div className="flex items-center justify-end gap-3">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-9 w-24 rounded-btn" />
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass("flush")}>
        <div className="border-b border-line bg-soft px-5 py-2.5">
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonRows rows={10} />
      </div>
    </SkeletonScreen>
  );
}
