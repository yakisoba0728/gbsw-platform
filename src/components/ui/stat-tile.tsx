import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 합계 한 칸. 상벌점 합계 카드와 통계 요약이 같은 모양을 각자 그리고 있었다.
 *
 * 바깥 격자는 호출부가 정한다 — 같은 칸이 전폭에도 서고 대시보드의 절반 폭
 * 카드 안에도 서므로, 몇 칸으로 접을지는 `@container`로 판단해야 한다.
 */
export function StatTile({
  label,
  value,
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 점수 색 (`kindColorClass`가 준다). */
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-card border border-line bg-surface px-4 py-3", className)}
    >
      <div className="text-xs font-medium text-mut">{label}</div>
      <div className={cn("mt-1 text-title font-semibold", valueClassName)}>
        {value}
      </div>
    </div>
  );
}
