import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { fieldBase, fieldClass, type FieldSize } from "./input";

/**
 * 고르는 칸. 크기 눈금은 `Input`과 같고, 화살표는 `field-chevron`이 그린다
 * (브라우저 기본 화살표는 OS마다 다르게 생겨 이 칸만 남의 앱처럼 보인다).
 *
 * `rows`는 네이티브 `size` 속성이다 — 주면 한 줄짜리 칸이 아니라 목록이 되므로
 * 높이를 고정하지 않는다. 이름을 바꿔 받는 이유는 우리 크기 눈금(`size`)과
 * 이름이 겹치기 때문이다.
 */
export function Select({
  size = "md",
  rows,
  className,
  ...props
}: Omit<ComponentProps<"select">, "size"> & {
  size?: FieldSize;
  /** 한 번에 보일 줄 수. 주면 목록형으로 펼쳐진다. */
  rows?: number;
}) {
  return (
    <select
      size={rows}
      className={cn(
        rows === undefined
          ? cn(fieldClass(size), "field-chevron")
          : cn(fieldBase(), "px-3 py-2"),
        className,
      )}
      {...props}
    />
  );
}
