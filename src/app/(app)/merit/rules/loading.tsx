import { pageClass } from "@/components/ui/page-shell";
import { Skeleton, SkeletonScreen, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className={pageClass("page", "space-y-4")}>
      <div className="rounded-card border border-line bg-surface p-5">
        <Skeleton className="h-5 w-28 rounded-btn" />
        <Skeleton className="mt-3 h-9 w-full rounded-field" />
        <Skeleton className="mt-3 h-7 w-64 rounded-btn" />
      </div>
      <SkeletonTable rows={10} />
    </SkeletonScreen>
  );
}
