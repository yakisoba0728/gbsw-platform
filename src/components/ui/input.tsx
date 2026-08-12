import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * 시안의 폼 인풋. 포커스 링은 globals.css의 base 레이어에서 공통 처리한다.
 *
 * `dense`는 시안의 가입 2단계처럼 필드가 많은 폼에서 쓰는 촘촘한 규격이다.
 */
export function Input({
  dense = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & { dense?: boolean }) {
  return (
    <input
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

export function Label({
  className,
  ...props
}: ComponentPropsWithoutRef<"label">) {
  return (
    <label
      className={cn(
        "mb-[7px] block text-[12.5px] font-semibold text-ink",
        className,
      )}
      {...props}
    />
  );
}
