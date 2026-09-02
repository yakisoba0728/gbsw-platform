import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function FilterRow({
  label,
  className,
  children,
}: {
  label?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label !== undefined && (
        <span className="mr-1 min-w-8 shrink-0 text-xs font-medium text-mut">{label}</span>
      )}
      {children}
    </div>
  );
}

export function ChipDivider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />;
}
