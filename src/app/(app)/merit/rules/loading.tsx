import { PageScaffold } from "@/components/ui/page-scaffold";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageScaffold
      width="data"
      title="상벌점 규정"
      description="학교가 정한 상벌점 항목과 점수를 찾습니다."
      tabs={<SkeletonTabs size="sm" />}
    >
      <SkeletonScreen className="space-y-4">
        <div className="rounded-card border border-line bg-surface p-5">
          <Skeleton className="h-5 w-28 rounded-btn" />
          <Skeleton className="mt-3 h-9 w-full rounded-field" />
          <Skeleton className="mt-3 h-7 w-64 rounded-btn" />
        </div>
        <SkeletonTable rows={10} />
      </SkeletonScreen>
    </PageScaffold>
  );
}
