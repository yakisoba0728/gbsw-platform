import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/merit/students`의 로딩 뼈대. 바깥 폭은 화면 본문과 같아야 좌우가 안 튄다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-4xl space-y-4">
      {/* ← 상벌점 */}
      <Skeleton className="h-4 w-20 rounded-btn" />

      {/* 제목 + 설명 두 줄 */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 rounded-btn" />
        <Skeleton className="h-8 w-full rounded-btn" />
      </div>

      {/* 검색 폼 */}
      <Skeleton className="h-10 rounded-btn" />

      <SkeletonTable rows={4} />
    </SkeletonScreen>
  );
}
