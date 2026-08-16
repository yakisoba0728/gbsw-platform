import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 링크로 된 필터 칩. 11곳이 같은 삼항 클래스 문자열을 복붙하고 있었다.
 *
 * ## hover를 button.tsx의 chip과 맞춘다
 * 손으로 쓴 링크 칩은 `hover:border-pri hover:text-pri`였고 `button.tsx`의
 * `chip` variant는 `hover:bg-soft`였다. **둘은 화면에서 나란히 선다** —
 * `/admin/merit/rules`의 종류 칩은 링크, `/admin/invites`의 상태 칩은 버튼인데
 * 사용자에겐 똑같이 "고르는 알약"이다. 같은 것이 다르게 반응하는 게 결함이므로
 * 하나로 맞춘다.
 *
 * button.tsx 쪽을 정본으로 삼는 이유: (1) 그쪽이 8덩어리로 더 많이 쓰이고,
 * (2) 선택 상태의 hover(`hover:bg-pri-press`)까지 이미 정의돼 있다 — 링크 쪽은
 * 선택된 칩에 hover가 아예 없어서 눌러도 반응이 없는 것처럼 보였다.
 *
 * ## 선택 상태를 색으로만 알리지 않는다
 * `aria-current="page"`를 붙인다. 선택된 칩은 실제로 "지금 보고 있는 주소"라
 * 링크에 맞는 표시이고, 색 대비만으로 구분하던 것이 화면을 못 보는 사람과
 * 저시력 사용자에게도 전달된다.
 *
 * ## 작은 칩의 터치 타깃
 * 작은 칩은 29px였다. **야간 점호 중 사감이 휴대폰으로 누르는 화면**이라
 * 모바일에서만 세로 여백을 키운다(`py-2 lg:py-1.5`) — 마우스가 있는 데스크톱은
 * 시안 그대로 촘촘하게 둔다.
 */
export function ChipLink({
  href,
  active,
  size = "md",
  className,
  children,
}: {
  href: string;
  active: boolean;
  /** `md`: 트랙 탭 · `sm`: 학년·반·학년도·자녀·종류 필터 */
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border whitespace-nowrap transition-colors",
        size === "md"
          ? "px-4 py-2 text-[13px]"
          : "px-3.5 py-2 text-[12.5px] lg:py-1.5",
        active
          ? "border-pri bg-pri font-bold text-white hover:bg-pri-press"
          : "border-line bg-surface font-semibold text-mut hover:bg-soft",
        className,
      )}
    >
      {children}
    </Link>
  );
}
