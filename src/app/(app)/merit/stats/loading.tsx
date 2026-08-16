import {
  Skeleton,
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit/stats`의 로딩 뼈대.
 *
 * 통계 칸은 **다섯 개**다(상점·벌점·상쇄점·순점수·부여 건수). 전에는 세 개를
 * 그려서, 집계가 도착하면 한 줄이 5칸으로 다시 짜이며 아래 그래프가 통째로
 * 밀렸다. 이 화면이 상벌점에서 가장 오래 기다리는 화면이라 그 덜컹임이 가장
 * 길게 보이던 자리이기도 하다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs />

      {/* "2026학년도 집계 · 반 편성 2026학년도" 한 줄 */}
      <Skeleton className="h-4 w-64 rounded-btn" />

      <SkeletonStats count={5} />

      {/* 월별 추이 · 반별(학생별) 순점수 · 분류별 분포 */}
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />
      <Skeleton className="h-[236px]" />

      {/* 기준 초과 학생 · 반별 현황 · 많이 나온 항목 */}
      <SkeletonTable rows={4} />
      <SkeletonTable rows={6} />
    </SkeletonScreen>
  );
}
