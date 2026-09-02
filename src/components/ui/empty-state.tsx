import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

export function EmptyState({
  variant = "card",
  action,
  className,
  children,
}: {
  variant?: "card" | "inside";
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        variant === "card" ? cardClass("flush", "px-5 py-12") : "px-5 py-12",
        className,
      )}
    >
      <p className="text-caption text-mut">{children}</p>
      {action}
    </div>
  );
}
