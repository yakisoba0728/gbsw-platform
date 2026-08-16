import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 시안의 폼 인풋. 포커스 링은 globals.css의 base 레이어에서 공통 처리한다.
 *
 * `dense`는 시안의 가입 2단계처럼 필드가 많은 폼에서 쓰는 촘촘한 규격이다.
 *
 * props 타입이 `ComponentPropsWithoutRef`가 아니라 **`ComponentProps`**인 이유:
 * React 19에서 ref는 그냥 평범한 prop이라 그대로 내려보내면 동작한다. 예전엔
 * 타입이 ref를 안 받아서 ref가 필요한 곳(rule-picker)이 같은 클래스 문자열을
 * 손으로 복제한 `<input>`을 따로 썼다 — 규격이 갈라지는 자리였다.
 */
export function Input({
  dense = false,
  className,
  ...props
}: ComponentProps<"input"> & { dense?: boolean }) {
  return <input className={cn(fieldClass(dense), className)} {...props} />;
}

/**
 * Input의 형제. 사유·메모처럼 여러 줄을 받는 칸이 쓴다.
 *
 * 클래스를 Input과 **공유한다** — 전에는 취소 사유 textarea가 같은 문자열을
 * 손으로 베껴 써서, Input 규격을 고쳐도 그 칸만 옛 모습으로 남았다.
 */
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
    dense ? "px-[13px] py-3" : "p-[13px]",
    "text-sm text-ink outline-none",
    "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
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
