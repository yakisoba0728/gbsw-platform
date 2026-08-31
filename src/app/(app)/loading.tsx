import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";
import { PageScaffold } from "@/components/ui/page-scaffold";

/**
 * 대시보드와 `/parent-invite`가 함께 쓰는 뼈대 — 이 폴더 아래에서 자기 뼈대가
 * 없는 화면은 이 둘뿐이라 어느 쪽에도 어긋나지 않는 중립적인 짜임으로 둔다.
 */
export default function Loading() {
  return (
    <PageScaffold
      eyebrow={<Skeleton as="span" className="inline-block h-4 w-28" />}
      title={
        <>
          <span className="sr-only">화면 불러오는 중</span>
          <Skeleton as="span" className="block h-7 w-48 max-w-full" />
        </>
      }
      description={
        <Skeleton as="span" className="inline-block h-4 w-72 max-w-full" />
      }
      actions={<Skeleton className="h-9 w-28 rounded-btn" />}
      width="data"
    >
      <SkeletonScreen className="@container space-y-5 lg:space-y-6">
        <Skeleton className="h-[116px] rounded-card" />

        {/* 화면과 같은 컨테이너 질의를 써야 내용이 도착할 때 단이 안 바뀐다. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @4xl:grid-cols-2 lg:gap-6">
          <Skeleton className="h-[176px] rounded-card" />
          <Skeleton className="h-[176px] rounded-card" />
        </div>

        <Skeleton className="h-[220px] rounded-card" />
      </SkeletonScreen>
    </PageScaffold>
  );
}
