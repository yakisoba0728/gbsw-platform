import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `/admin/settings`의 뼈대 — 카드 하나에 트랙 두 줄.
 *
 * 실제 화면과 줄 수가 같아야 내용이 도착할 때 자리가 안 튄다 (skeleton.tsx 머리
 * 주석). 트랙이 늘면 여기 반복 횟수도 함께 늘린다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-card border border-line bg-surface">
        <div className="space-y-2 border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-24 rounded-btn" />
          <Skeleton className="h-4 w-full max-w-md rounded-btn" />
        </div>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="border-b border-line2 px-5 py-4 last:border-0">
            <div className="flex flex-wrap items-end gap-2.5">
              <Skeleton className="h-[70px] w-[104px] rounded-field" />
              <Skeleton className="h-[70px] w-[124px] rounded-field" />
              <Skeleton className="h-[70px] w-[124px] rounded-field" />
              <Skeleton className="h-[42px] w-[72px] rounded-btn" />
            </div>
            <Skeleton className="mt-2 h-4 w-full max-w-lg rounded-btn" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}
