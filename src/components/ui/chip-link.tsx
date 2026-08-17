import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 링크로 된 필터 칩. `button.tsx`의 chip variant와 나란히 서므로 규격을 맞춘다.
 * 좁은 화면에서만 세로 여백을 키운다 — 야간 점호 중 휴대폰으로 누르는 화면이다.
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
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap transition-colors",
        size === "md" ? "px-4 py-2 text-caption" : "px-3 py-2 text-xs lg:py-1.5",
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-surface text-mut hover:bg-soft hover:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}
