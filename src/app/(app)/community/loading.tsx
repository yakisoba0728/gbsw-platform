import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="@container mx-auto max-w-5xl">
      <div className="grid gap-3 @2xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cardClass("panel")}>
            <Skeleton className="h-5 w-28 rounded-btn" />
            <Skeleton className="mt-2 h-4 w-48 rounded-btn" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
