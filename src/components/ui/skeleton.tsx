import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";
import type { FieldSize } from "./input";

export function Skeleton({
  as: Tag = "div",
  className,
}: {
  as?: "div" | "span";
  className?: string;
}) {
  return <Tag className={cn("animate-pulse rounded-btn bg-soft", className)} />;
}

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

export function SkeletonScreen({
  className = "mx-auto max-w-5xl space-y-4",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <SkeletonRegion className={className}>{children}</SkeletonRegion>;
}

export function SkeletonTabs({
  count = 2,
  size = "md",
  width = "w-16",
  className,
}: {
  count?: number;
  size?: "sm" | "md";
  width?: string;
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

export function SkeletonField({
  size = "md",
  className,
}: {
  size?: FieldSize;
  className?: string;
}) {
  return <Skeleton className={cn(FIELD_HEIGHTS[size], "rounded-field", className)} />;
}

const FIELD_HEIGHTS: Record<FieldSize, string> = {
  sm: "h-9 lg:h-8",
  md: "h-9",
  lg: "h-11",
};

export function SkeletonStats({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-20 min-w-35 flex-1 rounded-card" />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}

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
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}
