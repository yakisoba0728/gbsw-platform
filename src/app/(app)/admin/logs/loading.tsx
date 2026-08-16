import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `/admin/logs`의 뼈대 — 카드 하나(머리글 + 기간·동작 필터 + 행위자 검색 + 표).
 * 동작 필터는 DB에 실제로 쌓인 동작만큼 생기므로 줄바꿈까지 나는 자리다.
 * 뼈대에서도 두 줄 분량을 그려 내용이 도착할 때 표가 위로 튀지 않게 한다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl">
      <div className="rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-24 rounded-btn" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 14 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-2.5 h-10 rounded-field" />
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
