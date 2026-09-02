import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-24 rounded-btn" />
        <div className="space-y-2.5">
          <Skeleton className="h-[61px] rounded-field" />
          <Skeleton className="h-[61px] rounded-field" />
          <Skeleton className="h-[132px] rounded-card" />
          <Skeleton className="h-9 w-32 rounded-btn" />
        </div>
      </div>

      <SkeletonTable rows={5} titleWidth="w-24" />
    </SkeletonScreen>
  );
}
