import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
} from "@/components/ui/skeleton";

/**
 * `/merit/students`(명단에서 빠진 학생 찾기)의 로딩 뼈대.
 *
 * 바깥 폭은 `max-w-4xl` — 화면 본문과 같아야 결과가 도착할 때 좌우가 안 튄다.
 * 검색 결과가 오기 전에는 표가 없지만, 이 화면에 오래 걸리는 것이 그 표 하나뿐이라
 * 자리를 미리 잡아 둔다.
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
