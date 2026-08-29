import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit`의 로딩 뼈대 — 탭 · 검색 폼 · 학년 칩 · 반 명단.
 * 교사 모습에 맞춘다: 실제로 기다림이 생기는 쪽이 반 명단 집계다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs size="sm" />

      {/* 검색 폼 — 입력칸 + 버튼 */}
      <div className="flex gap-2">
        <SkeletonField size="sm" className="flex-1" />
        <Skeleton className="h-9 w-[72px] rounded-btn" />
      </div>

      {/* 학년·반 칩 줄. 카드가 아니다 — 실제 화면과 상자 수가 다르면 내용이
          들어오는 순간 화면이 한 칸 접히면서 아래 표가 위로 뛴다. */}
      <div className="flex flex-wrap gap-1.5">
        <SkeletonTabs count={4} size="sm" width="w-[68px]" />
      </div>

      <SkeletonTable />
    </SkeletonScreen>
  );
}
