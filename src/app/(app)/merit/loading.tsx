import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs size="sm" />

      <div className="flex gap-2">
        <SkeletonField size="sm" className="flex-1" />
        <Skeleton className="h-9 w-[72px] rounded-btn" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SkeletonTabs count={4} size="sm" width="w-[68px]" />
      </div>

      <SkeletonTable />
    </SkeletonScreen>
  );
}
