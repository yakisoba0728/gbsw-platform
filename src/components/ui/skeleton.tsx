import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 로딩 뼈대 조각.
 *
 * `loading.tsx` 4개가 **바이트 단위로 같았고**, 그래서 어느 화면에도 안 맞았다 —
 * `/merit/stats`는 통계 칸이 5개인데 뼈대는 3개를 그리고, `/merit/recent`는
 * 통계 칸이 아예 없는데 3개를 그렸다. 뼈대가 실제 화면과 다르면 내용이 도착할 때
 * 자리가 튀어서, "멈췄나"를 없애려던 것이 오히려 화면을 덜컹이게 만든다.
 *
 * 그래서 완성품 하나가 아니라 **조각**을 둔다. 화면마다 자기 짜임에 맞게 조립한다.
 */

/** 뼈대 한 덩어리. 크기는 호출부가 정한다. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-soft", className)} />;
}

/**
 * `loading.tsx`의 바깥 껍데기. 화면을 못 보는 사람에게 "불러오는 중"을 알린다 —
 * 뼈대는 눈으로만 읽히는 표시라 이 한 줄이 없으면 아무 일도 안 일어난 것과 같다.
 */
export function SkeletonScreen({
  className = "mx-auto max-w-5xl space-y-4",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      {children}
    </div>
  );
}

/** 트랙 탭 자리 (교내 · 기숙사). */
export function SkeletonTabs({ count = 2 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
  );
}

/**
 * 합계 칸 줄. 칸 수는 화면마다 다르다(합계 카드 3~4개, 통계 5개).
 *
 * `grid-cols-N`을 쓰지 않는 이유: N이 인자라 Tailwind가 클래스를 만들어 내지
 * 못한다. flex-wrap이 같은 일을 하고, 좁은 화면에서 저절로 줄바꿈까지 한다.
 */
export function SkeletonStats({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[84px] min-w-[140px] flex-1" />
      ))}
    </div>
  );
}

/** 머리글 + 표가 든 카드 자리 (최근 부여 · 감사로그 · 반 명단). */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-5 w-40 rounded-btn" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-6 rounded-btn" />
        ))}
      </div>
    </div>
  );
}
