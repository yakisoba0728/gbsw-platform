import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen, SkeletonTabs } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen>
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 rounded-btn" />
            <Skeleton className="h-4 w-64 rounded-btn" />
          </div>
          <SkeletonTabs size="sm" />
        </div>

        <SkeletonTabs count={4} size="sm" className="mt-3 flex-wrap" />
      </div>
    </SkeletonScreen>
  );
}
