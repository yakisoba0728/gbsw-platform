import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 라벨 달린 칩 줄 — 「학년 [전체][1][2][3]」.
 *
 * 여섯 화면이 같은 줄을 각자 그리고 있었고, 라벨 하나가 `w-8`로 폭이 고정된
 * 곳과 아닌 곳으로 갈려 있었다. 라벨 폭이 다르면 줄이 둘 이상일 때 칩의
 * 왼쪽 끝이 줄마다 어긋난다.
 *
 * **라벨 폭은 최소값으로 맞춘다.** 한 화면에 줄이 둘 이상이면 그 줄들이 같은
 * 자리에서 시작해야 눈이 칩만 훑는다. 다만 고정 폭이면 「학년도」처럼 세 글자인
 * 라벨이 넘쳐 첫 칩을 밀어낸다 — 넘칠 때만 늘어나게 둔다.
 */
export function FilterRow({
  label,
  className,
  children,
}: {
  /** 없으면 칩만 있는 줄이다(자녀 고르기처럼). */
  label?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label !== undefined && (
        <span className="mr-1 min-w-8 shrink-0 text-xs font-medium text-mut">{label}</span>
      )}
      {children}
    </div>
  );
}

/**
 * 한 줄 안에서 칩 무리를 가르는 세로줄. 세 화면이 같은 문자열을 베끼고 있었다.
 * 장식이라 보조기술에는 감춘다.
 */
export function ChipDivider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />;
}
