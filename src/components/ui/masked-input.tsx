"use client";

import type { ComponentPropsWithoutRef } from "react";
import { countSignificant, offsetAfterSignificant } from "@/lib/masks";
import { Input, type FieldSize } from "./input";

type MaskedInputProps = Omit<ComponentPropsWithoutRef<"input">, "onChange" | "size"> & {
  /** `Input`의 크기 눈금. 그대로 넘긴다. */
  size?: FieldSize;
  /** 값을 표시 서식으로 바꾼다. 영숫자를 넣거나 빼면 안 된다. */
  format: (raw: string) => string;
  /** 서식이 적용된 뒤의 값 */
  onValueChange?: (value: string) => void;
};

/**
 * 입력할 때마다 서식을 다시 매기는 인풋. onChange 한 곳에서만 처리하므로
 * 타이핑·붙여넣기·자동완성·IME 확정이 전부 같은 경로를 탄다.
 *
 * `value`를 주면 제어 입력이 된다 — 폼 자동 리셋(React 19)에도 값이 남아야 하는
 * 칸에 쓴다. 제어로 써도 커서는 튀지 않는다: 아래에서 el.value를 서식값으로 먼저
 * 맞춰 두고 부모가 onValueChange로 받은 같은 값을 value로 돌려주므로, React의
 * updateInput은 "DOM 값과 다를 때만 쓴다"에 걸려 DOM을 건드리지 않는다.
 */
export function MaskedInput({
  format,
  onValueChange,
  ...props
}: MaskedInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget;

    // 커서 앞의 영숫자 개수를 기준점으로 삼는다. 하이픈 개수에 흔들리지 않는다.
    const caret = el.selectionStart ?? el.value.length;
    const typedBefore = countSignificant(el.value.slice(0, caret));

    const formatted = format(el.value);

    // 이 대입은 제어로 쓸 때도 지우면 안 된다. 빼면 DOM에 서식 전 문자열이 남고
    // React가 뒤늦게 서식값을 써 넣으면서 커서가 끝으로 밀린다.
    if (formatted !== el.value) {
      el.value = formatted;
      const next = offsetAfterSignificant(formatted, typedBefore);
      el.setSelectionRange(next, next);
    }

    onValueChange?.(formatted);
  }

  return <Input {...props} onChange={handleChange} />;
}
