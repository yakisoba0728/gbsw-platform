"use client";

import type { ComponentPropsWithoutRef } from "react";
import { countSignificant, offsetAfterSignificant } from "@/lib/masks";
import { Input } from "./input";

type MaskedInputProps = Omit<ComponentPropsWithoutRef<"input">, "onChange"> & {
  dense?: boolean;
  /** 값을 표시 서식으로 바꾼다. 영숫자를 넣거나 빼면 안 된다. */
  format: (raw: string) => string;
  /** 서식이 적용된 뒤의 값 */
  onValueChange?: (value: string) => void;
};

/**
 * 입력할 때마다 서식을 다시 매기는 인풋.
 *
 * onChange 한 곳에서만 처리하므로 타이핑·붙여넣기·자동완성·IME 확정이
 * 전부 같은 경로를 탄다. 키 입력을 가로채는 방식은 붙여넣기를 놓친다.
 */
export function MaskedInput({
  format,
  onValueChange,
  ...props
}: MaskedInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget;

    // 커서 앞의 "영숫자 개수"를 기준점으로 삼는다. 하이픈이 몇 개 끼든 흔들리지 않는다.
    const caret = el.selectionStart ?? el.value.length;
    const typedBefore = countSignificant(el.value.slice(0, caret));

    const formatted = format(el.value);

    if (formatted !== el.value) {
      el.value = formatted;
      const next = offsetAfterSignificant(formatted, typedBefore);
      el.setSelectionRange(next, next);
    }

    onValueChange?.(formatted);
  }

  return <Input {...props} onChange={handleChange} />;
}
