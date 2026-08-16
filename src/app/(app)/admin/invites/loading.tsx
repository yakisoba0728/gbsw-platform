import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `/admin/invites`의 뼈대. 화면과 같은 2단 배치(발급 폼 · 발급 내역)를 그린다 —
 * 뼈대가 실제 짜임과 다르면 내용이 도착할 때 자리가 튀어서, "멈췄나"를 없애려던
 * 것이 오히려 화면을 덜컹이게 만든다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[360px_1fr]">
      {/* 가입코드 발급 폼 */}
      <div className="rounded-card border border-line bg-surface p-5 lg:p-6">
        <Skeleton className="h-5 w-32 rounded-btn" />
        <Skeleton className="mt-2 h-4 w-48 rounded-btn" />
        <div className="mt-4 mb-5 flex gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="mb-[15px] h-12 rounded-field" />
        ))}
        <Skeleton className="h-11 rounded-btn" />
      </div>

      {/* 발급 내역 */}
      <div className="min-w-0 rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-24 rounded-btn" />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
          <Skeleton className="mt-2.5 h-11 rounded-field" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-6 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
