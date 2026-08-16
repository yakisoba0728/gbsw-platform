/**
 * 로딩 스켈레톤. 집계 질의가 도는 동안 빈 화면 대신 뼈대를 보여준다 —
 * 실제로 빨라지지는 않지만 "멈췄나"라는 인상을 없앤다.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      <div className="flex gap-2">
        <div className="h-9 w-24 animate-pulse rounded-full bg-soft" />
        <div className="h-9 w-24 animate-pulse rounded-full bg-soft" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-card bg-soft" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card bg-soft" />
    </div>
  );
}
