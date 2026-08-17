import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * 대시보드와 `/parent-invite`가 함께 쓰는 뼈대 — 이 폴더 아래에서 자기 뼈대가
 * 없는 화면은 이 둘뿐이라 어느 쪽에도 어긋나지 않는 중립적인 짜임으로 둔다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <Skeleton className="h-[116px]" />

      {/* 화면과 같은 컨테이너 질의를 써야 내용이 도착할 때 단이 안 바뀐다. */}
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
