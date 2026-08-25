import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

/** 뼈대 한 덩어리. 크기는 화면이 자기 짜임에 맞게 정한다. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-btn bg-soft", className)} />;
}

/** 뼈대는 눈으로만 읽히므로 "불러오는 중"을 따로 알린다. */
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

/** 트랙 탭 자리. */
export function SkeletonTabs({
  count = 2,
  size = "md",
}: {
  count?: number;
  size?: "sm" | "md";
}) {
  return (
    <div className={size === "sm" ? "flex gap-1.5" : "flex gap-2"}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={
            size === "sm"
              ? "h-[38px] w-16 rounded-full lg:h-[30px]"
              : "h-9 w-24 rounded-full"
          }
        />
      ))}
    </div>
  );
}

/** 합계 칸 줄. `grid-cols-N`은 N이 인자라 Tailwind가 만들어 내지 못한다. */
export function SkeletonStats({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-20 min-w-35 flex-1 rounded-card" />
      ))}
    </div>
  );
}

/**
 * 카드 **안쪽**의 표 자리. 화면이 카드 껍데기와 머리글을 이미 그렸을 때 쓴다 —
 * 검색·필터가 그대로 서 있어야 하므로 결과 영역만 이걸로 바꾼다.
 */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}

/** 머리글 + 표가 든 카드 자리. */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className={cardClass("flush")}>
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    </div>
  );
}
