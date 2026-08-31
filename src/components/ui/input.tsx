import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * 입력칸의 크기 눈금 — **버튼과 같다.**
 *
 * 예전에는 여백(`py-2.5`·`py-2`)으로 높이가 정해졌고 버튼만 높이(`h-9`)로 정해져,
 * 한 줄에 나란히 선 둘이 늘 어긋났다 — 메모칸 42px 옆에 부여 버튼 36px, 검색칸
 * 38px 옆에 검색 버튼 36px. 화면 하나에 조작부 높이가 32·36·37·38·42px 다섯
 * 가지였다. 이제 같은 이름의 크기를 주면 같은 높이가 된다.
 *
 * `sm` 표 안·필터 줄 (Button sm과 짝) · `md` 기본 (Button md와 짝) ·
 * `lg` 로그인·가입처럼 칸이 큰 화면 (Button lg와 짝).
 */
export type FieldSize = "sm" | "md" | "lg";

/** 버튼의 SIZES와 같은 값이어야 한다. 한쪽만 고치면 다시 어긋난다. */
const HEIGHTS: Record<FieldSize, string> = {
  sm: "h-9 lg:h-8",
  md: "h-9",
  lg: "h-11",
};

/** 포커스 링은 globals.css의 base 레이어가 공통으로 그린다. */
export function Input({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: FieldSize }) {
  return <input className={cn(fieldClass(size), className)} {...props} />;
}

/**
 * 여러 줄 입력. **높이 눈금을 쓰지 않는다** — 줄 수가 높이를 정하므로 고정하면
 * `rows`가 무의미해진다. 대신 좌우 여백과 글자 규격을 입력칸과 맞춘다.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(fieldBase(), "px-3 py-2.5", className)} {...props} />
  );
}

/** Input·Select가 함께 쓰는 규격. 여기 한 곳만 고치면 둘 다 따라온다. */
export function fieldClass(size: FieldSize): string {
  return cn(fieldBase(), HEIGHTS[size], "px-3");
}

/** 높이를 뺀 공통 부분. 여러 줄 입력과 목록형 선택칸이 이것만 가져다 쓴다. */
export function fieldBase(): string {
  return cn(
    "ui-field w-full rounded-field border border-line bg-surface",
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
