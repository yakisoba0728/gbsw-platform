import {
  Skeleton,
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit/stats`의 로딩 뼈대. 칸·표 개수를 화면과 맞춘다 —
 * 어긋나면 집계가 도착할 때 자리가 통째로 다시 짜인다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      {/* 페이지 제목 */}
      <Skeleton className="h-7 w-40 rounded-btn" />

      <SkeletonTabs />

      {/* "2026학년도 집계 · 반 편성 2026학년도" 한 줄 */}
      <Skeleton className="h-4 w-64 rounded-btn" />

      <SkeletonStats count={5} />

      {/* 월별 추이 · 반별(학생별) 순점수 · 분류별 분포 */}
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />

      {/* 표는 셋이다 — 기준 초과 학생 · 반별 현황 · 많이 나온 항목. */}
      <SkeletonTable rows={4} />
      <SkeletonTable rows={6} />
      <SkeletonTable rows={5} />
    </SkeletonScreen>
  );
}
