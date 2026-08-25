import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonRows, SkeletonScreen, SkeletonTabs } from "@/components/ui/skeleton";

/**
 * `/merit/recent`의 로딩 뼈대 — 조건 패널 + 날짜별 목록.
 *
 * **page.tsx의 골격과 같은 값이어야 한다.** 어긋나면 화면이 들어오는 순간
 * 뼈대가 튀고, 그 튐은 느려서가 아니라 뼈대가 틀려서 생긴 것이라 원인을
 * 짚기 어렵다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-6 w-24" />
          <SkeletonTabs size="sm" />
        </div>

        <div className="@container mt-4 space-y-2.5">
          {/* 종류 · 상태 두 줄. 칩 높이는 ChipLink의 sm 규격을 따른다. */}
          <Skeleton className="h-[38px] w-72 rounded-full lg:h-[30px]" />
          <Skeleton className="h-[38px] w-56 rounded-full lg:h-[30px]" />

          <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
            <Skeleton className="h-10 max-w-xl rounded-field" />
            <div className="flex items-center justify-end gap-3">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-[38px] w-24 rounded-btn lg:h-[30px]" />
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass("flush", "overflow-hidden")}>
        {/* 날짜 구분선 자리 — 목록은 언제나 이것으로 시작한다. */}
        <div className="border-b border-line bg-soft px-5 py-2">
          <Skeleton className="h-4 w-32" />
        </div>
        <SkeletonRows rows={8} />
      </div>
    </SkeletonScreen>
  );
}
