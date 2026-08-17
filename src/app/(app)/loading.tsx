import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * 대시보드와 `/parent-invite`가 함께 쓰는 뼈대 — 이 폴더 아래에서 자기 뼈대가
 * 없는 화면은 이 둘뿐이라 어느 쪽에도 어긋나지 않는 중립적인 짜임으로 둔다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <Skeleton className="h-[104px]" />

      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[176px]" />
        <Skeleton className="h-[176px]" />
      </div>

      <Skeleton className="h-[220px]" />
    </SkeletonScreen>
  );
}
