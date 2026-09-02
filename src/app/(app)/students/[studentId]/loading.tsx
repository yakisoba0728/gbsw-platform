import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-4xl space-y-4">
      <Skeleton className="h-4 w-20 rounded-btn" />

      <div className={cardClass("panel")}>
        <Skeleton className="h-7 w-40 rounded-btn" />
        <Skeleton className="mt-2 h-4 w-56 rounded-btn" />
        <SkeletonTabs
          count={3}
          size="sm"
          width="w-[72px]"
          className="mt-3 flex-wrap"
        />
      </div>

      <SkeletonTable />
    </SkeletonScreen>
  );
}
