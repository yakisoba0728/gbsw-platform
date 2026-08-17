import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** 포커스 링은 globals.css의 base 레이어가 공통으로 그린다. */
export function Input({
  dense = false,
  className,
  ...props
}: ComponentProps<"input"> & { dense?: boolean }) {
  return <input className={cn(fieldClass(dense), className)} {...props} />;
}

export function Textarea({
  dense = false,
  className,
  ...props
}: ComponentProps<"textarea"> & { dense?: boolean }) {
  return <textarea className={cn(fieldClass(dense), className)} {...props} />;
}

/** Input·Textarea가 함께 쓰는 규격. 여기 한 곳만 고치면 둘 다 따라온다. */
function fieldClass(dense: boolean): string {
  return cn(
    "w-full rounded-field border border-line bg-surface",
    dense ? "px-3 py-2" : "px-3 py-2.5",
    "text-sm text-ink outline-none",
    "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-caption font-medium text-ink", className)}
      {...props}
    />
  );
}
