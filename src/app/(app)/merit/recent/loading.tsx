import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";
import {
  Skeleton,
  SkeletonField,
  SkeletonRows,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/merit/recent`의 로딩 뼈대 — 조건 패널 + 목록 표.
 *
 * **page.tsx의 골격과 같은 값이어야 한다.** 어긋나면 화면이 들어오는 순간
 * 뼈대가 튀고, 그 튐은 느려서가 아니라 뼈대가 틀려서 생긴 것이라 원인을
 * 짚기 어렵다.
 */
export default function Loading() {
  return (
    <PageScaffold
      width="data"
      title="최근 부여"
      description="최근 상벌점 기록을 찾고 잘못 부여한 기록을 취소합니다."
      tabs={<SkeletonTabs size="sm" />}
    >
      <SkeletonScreen className="space-y-4">
        <div className={cardClass("panel")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-9 w-24 rounded-btn" />
          </div>

          <div className="@container mt-4 space-y-2.5">
            {/* 종류 · 상태 두 줄. 칩 높이는 ChipLink의 sm 규격을 따른다. */}
            <SkeletonTabs count={4} size="sm" className="flex-wrap" />
            <SkeletonTabs count={3} size="sm" className="flex-wrap" />

            <SkeletonField size="sm" className="max-w-xl" />
          </div>
        </div>

        <div className={cardClass("flush")}>
          {/* 표 머리글 띠 자리. */}
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-10" />
          </div>
          <SkeletonRows rows={10} />
        </div>
      </SkeletonScreen>
    </PageScaffold>
  );
}
