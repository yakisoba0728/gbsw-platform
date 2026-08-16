import {
  Skeleton,
  SkeletonScreen,
  SkeletonStats,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * 학생 상세의 로딩 뼈대. 이 화면에는 원래 `loading.tsx`가 없어서 집계 두 개를
 * 병렬로 기다리는 동안 이전 화면이 그대로 멈춰 있었다.
 *
 * 바깥 폭은 `max-w-4xl` — 화면 본문과 같아야 내용이 도착할 때 좌우가 안 튄다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-4xl space-y-4">
      {/* ← 상벌점 */}
      <Skeleton className="h-4 w-20 rounded-btn" />

      {/* 이름 + 학생코드·학급 */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 rounded-btn" />
        <Skeleton className="h-4 w-56 rounded-btn" />
      </div>

      <SkeletonTabs />

      {/* 합계 카드는 상쇄점이 0이면 3칸이다 — 흔한 쪽에 맞춘다. */}
      <SkeletonStats count={3} />

      {/* 부여 폼 */}
      <Skeleton className="h-[180px]" />

      <SkeletonTable />
    </SkeletonScreen>
  );
}
