import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClass, type ButtonSize } from "./button";

/**
 * 링크로 된 필터 칩.
 *
 * **생김새를 직접 그리지 않는다.** `button.tsx`의 chip variant를 그대로 쓴다 —
 * 예전에는 규격을 베껴 적어 두었는데 둘이 조용히 갈라져, 같은 화면에 38px짜리
 * 칩 줄과 36px짜리 칩 줄이 나란히 서 있었다(계정 관리의 탭과 그 아래 계정 필터).
 * 글자 크기도 12px과 13px로 달랐고, 링크 쪽에는 포커스 링이 아예 없었다.
 */
export function ChipLink({
  href,
  active,
  size = "md",
  className,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  /** `md`: 트랙 탭 · `sm`: 학년·반·학년도·자녀·종류 필터 */
  size?: Extract<ButtonSize, "sm" | "md">;
  className?: string;
  /**
   * 이동을 취소할 수 있는 훅. `event.preventDefault()`로 막는다 —
   * 저장하지 않은 수정이 있을 때 떠나기 전에 묻는 자리가 쓴다.
   */
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={buttonClass({ variant: "chip", size, active, className })}
    >
      {children}
    </Link>
  );
}
