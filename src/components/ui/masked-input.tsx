"use client";

import type { ComponentPropsWithoutRef } from "react";
import { countSignificant, offsetAfterSignificant } from "@/lib/masks";
import { Input, type FieldSize } from "./input";

type MaskedInputProps = Omit<ComponentPropsWithoutRef<"input">, "onChange" | "size"> & {
  size?: FieldSize;
  format: (raw: string) => string;
  onValueChange?: (value: string) => void;
};

export function MaskedInput({
  format,
  onValueChange,
  ...props
}: MaskedInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget;

    // 구분자를 다시 넣어도 입력한 문자 기준 커서 위치를 유지한다.
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
