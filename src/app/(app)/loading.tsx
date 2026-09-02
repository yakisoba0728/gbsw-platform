import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen>
      <Skeleton className="h-[116px]" />

      <div className="@container">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl:grid-cols-2">
          <Skeleton className="h-[176px]" />
          <Skeleton className="h-[176px]" />
        </div>
      </div>

      <Skeleton className="h-[220px]" />
    </SkeletonScreen>
  );
}
