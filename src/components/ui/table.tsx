import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 표 껍데기 — 가로 스크롤 상자 + `<table>` + `<colgroup>` + 머리글.
 *
 * **완전 제네릭한 DataTable은 만들지 않는다.** 13개 표의 셀은 링크·배지·입력칸·
 * 취소 버튼이 제각각이라 열을 데이터로 기술하려 들면 렌더 콜백 표를 또 만들게
 * 된다. 실제로 똑같은 건 껍데기와 머리글뿐이라 거기까지만 뽑는다. `<tbody>`는
 * 호출부가 children으로 그대로 넘긴다.
 *
 * ## 셀 패딩 규칙 (여기서 정한다)
 * **첫 열과 마지막 열은 `px-5`, 나머지는 `px-3`.** 카드 안쪽 여백(px-5)과 첫/끝
 * 열을 맞춰야 표가 카드에 붙어 보이지 않는다. 화면마다 `px-2`(최근 부여)와
 * `px-3`(나머지)로 갈려 있었는데, 좁은 쪽에 맞추면 열이 다닥다닥 붙고 화면 간
 * 눈금이 어긋나므로 다수인 `px-3`으로 통일한다. `<tbody>`의 셀도 이 규칙을 따라
 * 적어야 머리글과 세로줄이 맞는다.
 *
 * ## 정렬·오른쪽 맞춤
 * 머리글 칸은 `ReactNode`라 `<button>`(정렬 가능한 헤더)을 그대로 넣을 수 있다.
 * 오른쪽 맞춤이 필요하면 `<span className="block text-right">`으로 감싼다 —
 * `<th>`에 클래스를 따로 받는 인자를 두면 열마다 예외가 늘어난다.
 */
export function TableFrame({
  minWidth,
  cols,
  headers,
  fixed = false,
  className,
  children,
}: {
  /**
   * 표가 찌그러지지 않는 최소 폭(px). 420~840으로 제각각인 건 열 구성이 달라서라
   * 정상이다. Tailwind는 `min-w-[${n}px]`처럼 실행 중에 만들어지는 클래스를
   * 생성하지 못하므로 인라인 style로 준다.
   */
  minWidth: number;
  /** `<colgroup>`의 열별 클래스. `undefined`면 폭을 지정하지 않는 열이다. */
  cols?: readonly (string | undefined)[];
  headers: readonly ReactNode[];
  /** 글자 길이와 무관하게 열 폭을 고정한다 (최근 부여·감사로그처럼 넘치는 표). */
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
          <tr className="border-b border-line2 text-[12px] text-mut">
            {headers.map((header, i) => (
              <th
                key={i}
                className={cn(
                  "py-2.5 font-semibold",
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

/**
 * 위의 패딩 규칙을 `<tbody>` 셀도 쓸 수 있게 내보낸다 — 머리글과 본문이 각자
 * 다른 숫자를 적기 시작하면 세로줄이 어긋난다.
 */
export function tableCellPadding(index: number, count: number): string {
  return index === 0 || index === count - 1 ? "px-5" : "px-3";
}
