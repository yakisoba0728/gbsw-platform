import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit`의 로딩 뼈대 — 탭 · 검색 폼 · 학년/반 칩 카드 · 반 명단.
 * 관리자 모습에 맞춘다: 실제로 기다림이 생기는 쪽이 반 명단 집계다.
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

      {/* 반 고르기 카드 — 제목 + 학년·반 칩 */}
      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-20 rounded-btn" />
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
