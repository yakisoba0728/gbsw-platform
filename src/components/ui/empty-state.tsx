import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * "아직 아무것도 없습니다" 자리.
 *
 * 규격이 두 갈래로 갈려 있었다 — 자기 카드로 서는 9곳
 * (`rounded-card border … p-8 text-center text-[12.5px]`)과 이미 카드 안(표 자리)인
 * 4곳(`px-5 py-10 text-center text-sm`). **어느 쪽을 쓸지는 취향이 아니라 위치가
 * 정한다**: 카드 안에 카드를 또 그리면 테두리가 겹쳐 보인다. 그래서 두 규격을
 * 지우지 않고 variant로 남긴다.
 *
 * `card`  — 카드가 아직 없는 자리. 자기 테두리를 그린다.
 * `inside` — 이미 SectionCard 안. 테두리 없이 여백만 준다.
 */
export function EmptyState({
  variant = "card",
  className,
  children,
}: {
  variant?: "card" | "inside";
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-center text-mut",
        variant === "card"
          ? "rounded-card border border-line bg-surface p-8 text-[12.5px]"
          : "px-5 py-10 text-sm",
        className,
      )}
    >
      {children}
    </p>
  );
}
