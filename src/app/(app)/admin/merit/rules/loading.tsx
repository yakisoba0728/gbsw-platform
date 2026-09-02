import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-5 w-20 rounded-btn" />
          <SkeletonTabs size="sm" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2.5">
          <Skeleton className="h-[61px] min-w-[180px] flex-[2] rounded-field" />
          <Skeleton className="h-[61px] min-w-[100px] flex-1 rounded-field" />
          <Skeleton className="h-[61px] w-[90px] rounded-field" />
          <Skeleton className="h-[61px] min-w-[110px] flex-1 rounded-field" />
          <Skeleton className="h-[61px] min-w-[160px] flex-[2] rounded-field" />
        </div>
      </div>

      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-20 rounded-btn" />
        <SkeletonField />
        <SkeletonTabs count={5} size="sm" className="mt-3 flex-wrap" />
        <Skeleton className="mt-3 h-4 w-16 rounded-btn" />
      </div>

      <SkeletonTable rows={10} titleWidth="w-20" />
    </SkeletonScreen>
  );
}
