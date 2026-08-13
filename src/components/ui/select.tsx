import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * 시안에 셀렉트가 없어 Input 규격을 그대로 따른다.
 * 화살표는 브라우저 기본을 쓴다 — 없는 시안을 지어내지 않는다.
 */
export function Select({
  dense = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"select"> & { dense?: boolean }) {
  return (
    <select
      className={cn(
        "w-full rounded-field border border-line bg-surface",
        dense ? "px-[13px] py-3" : "p-[13px]",
        "text-sm text-ink outline-none",
        "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
        className,
      )}
      {...props}
    />
  );
}
