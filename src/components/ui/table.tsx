import type { AriaAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 표 껍데기 — 가로 스크롤 상자 + `<table>` + `<colgroup>` + 머리글.
 * `<tbody>`는 호출부가 children으로 넘긴다.
 *
 * 셀 패딩: 첫 열과 마지막 열은 `px-5`, 나머지는 `px-3`. `<tbody>`도 같은 규칙을
 * 따라야 머리글과 세로줄이 맞는다 (`tableCellPadding`).
 */
export function TableFrame({
  minWidth,
  cols,
  headers,
  sort,
  fixed = false,
  className,
  children,
}: {
  /** 표가 찌그러지지 않는 최소 폭(px). Tailwind는 실행 중 클래스를 못 만든다. */
  minWidth: number;
  /** `<colgroup>`의 열별 클래스. `undefined`면 폭을 지정하지 않는 열이다. */
  cols?: readonly (string | undefined)[];
  headers: readonly ReactNode[];
  /**
   * 열별 `aria-sort`. headers와 같은 순서로 늘어놓는다. 보조기술은 헤더 셀에서
   * 이 값을 읽으므로 headers 안의 `<button>`으로 내려보낼 수 없다.
   */
  sort?: readonly (AriaAttributes["aria-sort"] | undefined)[];
  /** 글자 길이와 무관하게 열 폭을 고정한다. */
  fixed?: boolean;
  className?: string;
  /** `<tbody>` */
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table
        className={cn("w-full text-left text-sm", fixed && "table-fixed")}
        style={{ minWidth }}
      >
        {cols && (
          <colgroup>
            {cols.map((col, i) => (
              <col key={i} className={col} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className="border-b border-line bg-soft text-xs text-mut">
            {headers.map((header, i) => (
              <th
                key={i}
                aria-sort={sort?.[i]}
                className={cn(
                  "py-2.5 font-medium",
                  tableCellPadding(i, headers.length),
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

/** 위의 패딩 규칙을 `<tbody>` 셀도 쓴다. 각자 적으면 세로줄이 어긋난다. */
export function tableCellPadding(index: number, count: number): string {
  return index === 0 || index === count - 1 ? "px-5" : "px-3";
}
