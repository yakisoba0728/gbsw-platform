import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { fieldClass, type FieldSize } from "./input";

/**
 * 고르는 칸. 크기 눈금은 `Input`과 같고, 화살표는 `field-chevron`이 그린다
 * (브라우저 기본 화살표는 OS마다 다르게 생겨 이 칸만 남의 앱처럼 보인다).
 */
export function Select({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"select">, "size"> & {
  size?: FieldSize;
}) {
  return (
    <select
      className={cn(fieldClass(size), "field-chevron", className)}
      {...props}
    />
  );
}
