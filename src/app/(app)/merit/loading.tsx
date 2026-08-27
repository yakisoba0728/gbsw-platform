import { cardClass } from "@/components/ui/card";
import { pageClass } from "@/components/ui/page-shell";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit`의 로딩 뼈대 — 탭 · 검색 폼 · 학년/반 칩 카드 · 반 명단.
 * 교사 모습에 맞춘다: 실제로 기다림이 생기는 쪽이 반 명단 집계다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className={pageClass("wide", "space-y-4")}>
      <SkeletonTabs size="sm" />

      {/* 검색 폼 — 입력칸 + 버튼 */}
      <div className="flex gap-2">
        <SkeletonField size="sm" className="flex-1" />
        <Skeleton className="h-9 w-[72px] rounded-btn" />
      </div>

      {/* 반 고르기 카드 — 제목 + 학년·반 칩 */}
      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-20 rounded-btn" />
        <div className="flex flex-wrap gap-1.5">
          <SkeletonTabs count={4} size="sm" width="w-[68px]" />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <SkeletonTabs count={5} size="sm" width="w-[60px]" />
        </div>
      </div>

      <SkeletonTable />
    </SkeletonScreen>
  );
}
