import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <div className={cardClass("panel")}>
        <Skeleton className="h-5 w-28 rounded-btn" />
        <Skeleton className="mt-3 h-9 w-full rounded-field" />
        <Skeleton className="mt-3 h-7 w-64 rounded-btn" />
      </div>
      <SkeletonTable rows={10} />
    </SkeletonScreen>
  );
}
