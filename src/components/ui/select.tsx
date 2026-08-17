import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Input과 같은 규격. 화살표는 브라우저 기본을 쓴다. */
export function Select({
  dense = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"select"> & { dense?: boolean }) {
  return (
    <select
      className={cn(
        "w-full rounded-field border border-line bg-surface",
        dense ? "px-3 py-2" : "px-3 py-2.5",
        "text-sm text-ink outline-none",
        "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
        className,
      )}
      {...props}
    />
  );
}
