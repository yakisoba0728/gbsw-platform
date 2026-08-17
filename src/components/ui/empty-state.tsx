import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * `card` — 카드가 아직 없는 자리. 자기 테두리를 그린다.
 * `inside` — 이미 SectionCard 안. 테두리를 또 그리면 겹쳐 보인다.
 */
export function EmptyState({
  variant = "card",
  className,
  children,
}: {
  variant?: "card" | "inside";
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-center text-caption text-mut",
        variant === "card"
          ? "rounded-card border border-line bg-surface px-5 py-10"
          : "px-5 py-10",
        className,
      )}
    >
      {children}
    </p>
  );
}
