import { cardClass } from "@/components/ui/card";
import {
  Skeleton,
  SkeletonField,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/** `/admin/merit/rules`의 뼈대 — 규정 추가 폼 · 검색/종류 필터 · 규정 표. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      {/* 규정 추가 — 아래 다섯 칸의 폭은 rule-form.tsx의 @xl: 폭과 같은 값이다.
          어긋나면 내용이 도착할 때 자리가 튄다. 한쪽을 고치면 다른 쪽도 고친다. */}
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-5 w-20 rounded-btn" />
          <SkeletonTabs size="sm" />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2.5">
          {/* 라벨(≈25px) + 입력칸(md 36px). `Input`의 크기 눈금을 따라간다. */}
          <Skeleton className="h-[61px] min-w-[180px] flex-[2] rounded-field" />
          <Skeleton className="h-[61px] min-w-[100px] flex-1 rounded-field" />
          <Skeleton className="h-[61px] w-[90px] rounded-field" />
          <Skeleton className="h-[61px] min-w-[110px] flex-1 rounded-field" />
          <Skeleton className="h-[61px] min-w-[160px] flex-[2] rounded-field" />
        </div>
      </div>

      {/* 규정 찾기 — 제목 + 검색 + 종류 필터 */}
      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-20 rounded-btn" />
        <SkeletonField />
        <SkeletonTabs count={5} size="sm" className="mt-3 flex-wrap" />
        <Skeleton className="mt-3 h-4 w-16 rounded-btn" />
      </div>

      {/* 규정 목록 — 머리글 띠 + 표 */}
      <div className={cardClass("flush")}>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-20 rounded-btn" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
