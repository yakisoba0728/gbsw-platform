import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

export function StatTile({
  label,
  value,
  hint,
  variant = "boxed",
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  variant?: "boxed" | "plain";
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        variant === "boxed" ? cardClass("flush", "px-4 py-3") : "px-4 py-3",
        className,
      )}
    >
      <div className="text-xs font-medium text-mut">{label}</div>
      <div
        className={cn(
          "mt-1 text-title font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-mut2">{hint}</div>}
    </div>
  );
}

export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="@container">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div
          className={cn(
            "-mr-px -mb-px grid",
            "[&>*]:border-r [&>*]:border-b [&>*]:border-line2",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
