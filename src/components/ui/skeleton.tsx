import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";
import type { FieldSize } from "./input";

/**
 * 뼈대 한 덩어리. 크기는 화면이 자기 짜임에 맞게 정한다.
 *
 * `as="span"`은 `<p>` 안에 들어가는 자리가 쓴다 — `<div>`를 문단에 넣으면
 * 브라우저가 문단을 먼저 닫아 버려 하이드레이션이 어긋난다.
 */
export function Skeleton({
  as: Tag = "div",
  className,
}: {
  as?: "div" | "span";
  className?: string;
}) {
  return <Tag className={cn("animate-pulse rounded-btn bg-soft", className)} />;
}

/** 실제 loading/Suspense fallback 하나가 알림 하나를 소유한다. */
export function SkeletonRegion({
  className,
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

/** 화면 전체 fallback의 폭·간격과 로딩 알림을 함께 잡는다. */
export function SkeletonScreen({
  className = "mx-auto max-w-5xl space-y-4",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <SkeletonRegion className={className}>{children}</SkeletonRegion>;
}

/**
 * 칩 줄 자리 — 트랙 탭·필터 칩.
 *
 * 높이는 `button.tsx`의 chip 규격을 따른다: `sm`은 `h-9 lg:h-8`, `md`는 `h-9`.
 * 여기 숫자를 손으로 적어 두었더니 실제 칩과 8px까지 어긋난 채 굳어 있었다 —
 * 뼈대가 내용보다 낮으면 결과가 도착할 때 화면이 통째로 밀린다.
 */
export function SkeletonTabs({
  count = 2,
  size = "md",
  /** 칩 하나의 폭. 글자 수가 다른 줄은 호출부가 정한다. */
  width = "w-16",
  className,
}: {
  count?: number;
  size?: "sm" | "md";
  width?: string;
  /** 줄 자체의 여백·줄바꿈. 실제 칩 줄이 쓰는 것과 같은 값을 준다. */
  className?: string;
}) {
  return (
    <div className={cn(size === "sm" ? "flex gap-1.5" : "flex gap-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "rounded-full",
            size === "sm" ? "h-9 lg:h-8" : "h-9",
            width,
          )}
        />
      ))}
    </div>
  );
}

/**
 * 입력칸 자리. 실제 높이는 `Input`의 `dense`가 38px, 기본이 42px이다 —
 * 다섯 화면이 40·40·42·44·44로 제각기 어림잡고 있었다.
 */
export function SkeletonField({
  size = "md",
  className,
}: {
  size?: FieldSize;
  className?: string;
}) {
  return <Skeleton className={cn(FIELD_HEIGHTS[size], "rounded-field", className)} />;
}

/** `input.tsx`의 HEIGHTS와 같은 값이어야 한다. 한쪽만 고치면 다시 어긋난다. */
const FIELD_HEIGHTS: Record<FieldSize, string> = {
  sm: "h-9 lg:h-8",
  md: "h-9",
  lg: "h-11",
};

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
    <div className="space-y-3 px-5 py-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}

/** 머리글 + 표가 든 카드 자리. */
export function SkeletonTable({
  rows = 6,
  titleWidth = "w-40",
  controls,
}: {
  rows?: number;
  titleWidth?: string;
  controls?: ReactNode;
}) {
  return (
    <div className={cardClass("flush")}>
      <div className="border-b border-line px-5 py-4">
        <Skeleton className={cn("h-5", titleWidth)} />
        {controls}
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: rows }, (_, i) => (
          // table.tsx의 text-sm + py-2.5 행은 약 41px다. h-8과 gap-3의
          // 44px 피치로 실제 표 높이를 가깝게 잡아 결과가 올 때 밀리지 않게 한다.
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
