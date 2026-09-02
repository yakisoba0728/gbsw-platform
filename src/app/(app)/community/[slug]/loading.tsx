import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <div className={cardClass("flush")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-28 rounded-btn" />
          <Skeleton className="h-8 w-20 rounded-btn" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-6 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
