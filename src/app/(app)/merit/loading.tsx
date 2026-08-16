import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit`의 로딩 뼈대.
 *
 * **이 화면의 관리자 모습에 맞춘다** — 탭 · 검색 폼 · 학년/반 칩 카드 · 반 명단.
 * 실제로 기다림이 생기는 쪽이 거기다(반을 고르면 명단 집계가 돈다). 전에는 네
 * 화면이 같은 뼈대를 쓰면서 여기에 통계 카드 세 칸을 그렸는데, 이 화면에는
 * 통계 칸이 애초에 없어서 내용이 도착할 때 자리가 통째로 튀었다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs />

      {/* 검색 폼 — 입력칸 + 버튼 */}
      <div className="flex gap-2">
        <Skeleton className="h-[42px] flex-1 rounded-field" />
        <Skeleton className="h-[42px] w-[72px] rounded-btn" />
      </div>

      {/* 학년·반 칩 카드 */}
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[30px] w-[68px] rounded-full" />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[30px] w-[60px] rounded-full" />
          ))}
        </div>
      </div>

      <SkeletonTable />
    </SkeletonScreen>
  );
}
