import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonField,
  SkeletonRows,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/pass/history`의 로딩 뼈대 — 조건 패널 + 목록 표.
 *
 * **page.tsx의 골격과 같은 값이어야 한다.** 어긋나면 화면이 들어오는 순간
 * 뼈대가 튀고, 그 튐은 느려서가 아니라 뼈대가 틀려서 생긴 것이라 원인을
 * 짚기 어렵다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl space-y-4">
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>

        <div className="@container mt-4 space-y-2.5">
          {/* 유형 세 칩 · 상태 여섯 칩. 높이는 ChipLink의 sm 규격을 따른다. */}
          <SkeletonTabs count={3} size="sm" className="flex-wrap" />
          <SkeletonTabs count={6} size="sm" className="flex-wrap" />

          {/* 기간 — 날짜 칸 둘과 「적용」. 칸 폭은 page.tsx의 w-40과 같다. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <SkeletonField size="sm" className="w-40" />
            <SkeletonField size="sm" className="w-40" />
            <Skeleton className="h-9 w-14 rounded-btn lg:h-8" />
          </div>

          <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
            <SkeletonField size="sm" className="max-w-xl" />
            <div className="flex items-center justify-end gap-3">
              <Skeleton className="h-4 w-10" />
              {/* 내보내기 버튼은 md라 높이가 고정이다 — 칩과 달리 좁은 폭에서 안 커진다. */}
              <Skeleton className="h-9 w-24 rounded-btn" />
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass("flush")}>
        {/* 표 머리글 띠 자리. */}
        <div className="border-b border-line bg-soft px-5 py-2.5">
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonRows rows={10} />
      </div>
    </SkeletonScreen>
  );
}
