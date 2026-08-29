import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

/**
 * 합계 한 칸.
 *
 * 바깥 격자는 호출부가 정한다 — 같은 칸이 전폭에도 서고 대시보드의 절반 폭
 * 카드 안에도 서므로, 몇 칸으로 접을지는 `@container`로 판단해야 한다.
 *
 * `boxed`는 낱개로 설 때(테두리를 스스로 그린다), `plain`은 `StatStrip` 안에
 * 들어갈 때다 — 띠가 테두리를 갖고 칸은 구분선만 나눠 갖는다.
 */
export function StatTile({
  label,
  value,
  hint,
  variant = "boxed",
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 숫자 아래 한 줄 — 「전교 9명 중」처럼 값을 읽는 기준. */
  hint?: ReactNode;
  variant?: "boxed" | "plain";
  /** 점수 색 (`kindColorClass`가 준다). */
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        variant === "boxed" ? cardClass("flush", "px-4 py-3") : "px-4 py-3",
        className,
      )}
    >
      <div className="text-xs font-medium text-mut">{label}</div>
      <div
        className={cn(
          "mt-1 text-title font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-mut2">{hint}</div>}
    </div>
  );
}

/**
 * 합계 여러 칸을 **테두리 하나** 안에 묶는다.
 *
 * 예전에는 칸마다 테두리를 그려서, 다섯 칸이 나란히 서면 세로선이 열 줄 그어졌다
 * — 같은 것을 다섯 조각으로 나눈 하나가 아니라 서로 다른 상자 다섯으로 읽힌다.
 * 띠 하나가 테두리를 갖고 칸 사이는 머리카락 선으로만 가른다.
 *
 * 몇 칸으로 접을지는 호출부가 `@container`로 정한다.
 */
export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="@container">
      {/*
       * 칸 사이의 선을 **칸이 그린다.** 격자는 자기가 몇 줄로 접혔는지 CSS로
       * 알려 줄 방법이 없어서, 「마지막만 빼고 오른쪽 선」 식으로는 줄이 접히는
       * 순간 줄 끝에 선이 남는다(네 칸이 두 줄로 접히면 두 번째 칸 오른쪽).
       *
       * 그래서 칸마다 오른쪽·아래 선을 다 긋고, 격자를 1px씩 끌어내어 바깥으로
       * 삐져나온 마지막 줄·마지막 칸의 선을 껍데기의 overflow-hidden이 자른다.
       * 몇 줄로 접히든 안쪽에만 선이 남는다.
       */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div
          className={cn(
            "-mr-px -mb-px grid",
            "[&>*]:border-r [&>*]:border-b [&>*]:border-line2",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
