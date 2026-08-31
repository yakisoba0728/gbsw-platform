import type { AriaAttributes, ReactNode } from "react";
import { HorizontalScrollRegion } from "@/components/ui/horizontal-scroll-region";
import { cn } from "@/lib/cn";

/**
 * 표 껍데기 — 가로 스크롤 상자 + `<table>` + `<colgroup>` + 머리글.
 * `<tbody>`는 호출부가 children으로 넘긴다.
 *
 * 좁은 폭에서 카드로 바꿔야 하는 표는 이걸 직접 쓰지 말고 `DataTable`을 쓴다.
 *
 * 셀 패딩: 첫 열과 마지막 열은 `px-5`, 나머지는 `px-3`. `<tbody>`도 같은 규칙을
 * 따라야 머리글과 세로줄이 맞는다 (`tableCellPadding`).
 */
export function TableFrame({
  minWidth,
  cols,
  headers,
  ariaLabel,
  sort,
  fixed = false,
  gutter = true,
  className,
  children,
}: {
  /** 표가 찌그러지지 않는 최소 폭(px). Tailwind는 실행 중 클래스를 못 만든다. */
  minWidth: number;
  /** `<colgroup>`의 열별 클래스. `undefined`면 폭을 지정하지 않는 열이다. */
  cols?: readonly (string | undefined)[];
  headers: readonly ReactNode[];
  /** 가로 스크롤 영역을 키보드와 보조기술에서 구분하는 이름. */
  ariaLabel: string;
  /**
   * 열별 `aria-sort`. headers와 같은 순서로 늘어놓는다. 보조기술은 헤더 셀에서
   * 이 값을 읽으므로 headers 안의 `<button>`으로 내려보낼 수 없다.
   */
  sort?: readonly (AriaAttributes["aria-sort"] | undefined)[];
  /** 글자 길이와 무관하게 열 폭을 고정한다. */
  fixed?: boolean;
  /**
   * 첫·끝 열의 바깥 여백. 기본은 있다(`px-5`).
   *
   * 여백이 이미 있는 카드(`cardClass("page")`) 안에 표를 넣는 자리가 끄고 쓴다 —
   * 그대로 두면 표의 첫 글자만 20px 더 들어가, 바로 위 문단과 왼쪽 끝이 어긋난다.
   * 인쇄 확인서가 그런 자리다.
   */
  gutter?: boolean;
  className?: string;
  /** `<tbody>` */
  children: ReactNode;
}) {
  return (
    // scroll-x-hint — 넘칠 때만 양끝에 그림자가 선다. 없으면 잘린 열이 있다는
    // 사실 자체가 화면에 안 보인다 (수정·삭제 버튼이 300px 뒤에 숨는다).
    //
    // rounded-b-card — 이 상자는 불투명한 흰 그라디언트를 칠하는데(그림자를 가리는
    // 장치다), 카드 바닥에 붙으면 그 사각형이 카드의 둥근 모서리를 덮어 모서리가
    // 잘린 것처럼 보인다. 카드 중간에 있을 때는 양끝 32px 그라디언트에만 닿아
    // 눈에 띄지 않으므로, 자리를 따지지 않고 늘 둥글린다.
    <HorizontalScrollRegion ariaLabel={ariaLabel} className={className}>
      <table
        className={cn(
          "w-full text-left text-sm",
          // 훑는 표다. 마우스가 지나는 줄에 옅은 바탕을 깔아 눈이 가로로 미끄러지지
          // 않게 한다 — 열이 예닐곱이면 이름과 순점수가 같은 줄인지 확신이 안 선다.
          // 색을 바꾸는 것이 아니라 바탕만 얹으므로 rowClassName의 글자색을 덮지 않는다.
          "[&>tbody>tr]:transition-colors [&>tbody>tr:hover]:bg-soft",
          fixed && "table-fixed",
        )}
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
          <tr className="border-b border-line bg-soft text-xs text-mut2">
            {headers.map((header, i) => (
              <th
                key={i}
                aria-sort={sort?.[i]}
                className={cn(
                  "py-2 font-medium",
                  tableCellPadding(i, headers.length, gutter),
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </HorizontalScrollRegion>
  );
}

/** 위의 패딩 규칙을 `<tbody>` 셀도 쓴다. 각자 적으면 세로줄이 어긋난다. */
export function tableCellPadding(
  index: number,
  count: number,
  gutter = true,
): string {
  const edge = index === 0 || index === count - 1;
  // 바깥 여백을 끈 표에서도 열 사이는 벌린다 — 안 벌리면 글자끼리 맞붙는다.
  if (!gutter) return edge ? (index === 0 ? "pr-3" : "pl-3") : "px-3";
  return edge ? "px-5" : "px-3";
}

/** 카드 모드에서 이 열이 앉는 자리. */
export type CardSlot = "title" | "trailing" | "meta" | "actions";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  /** `<colgroup>`용 폭 클래스. */
  width?: string;
  sort?: AriaAttributes["aria-sort"];
  /**
   * 카드 모드에서 앉는 자리. **비우면 카드에 나오지 않는다** — 375px에 안 들어가는
   * 열을 여기서 걸러 낸다. 열을 "접는" 대신 빼는 이유: 접힌 열은 값이 없는 것처럼
   * 읽힌다(순점수가 없는 게 아니라 안 보이는 것이다).
   */
  card?: CardSlot;
  /** `card: "meta"`일 때 값 앞 라벨. 기본은 header, `false`면 라벨 없음. */
  cardLabel?: ReactNode | false;
  /**
   * `<th>`·`<td>`에 함께 붙는 클래스. 정렬·색처럼 **열 전체의 성질**을 여기 적는다.
   * 행마다 래퍼로 감싸면 같은 말을 행 수만큼 되풀이하게 된다.
   */
  className?: string;
};

/**
 * 열을 데이터로 기술하는 표. 좁은 폭에서 카드 목록으로 바뀔 수 있다.
 *
 * `narrow="cards"`면 표와 카드를 **함께 렌더하고 CSS로 하나만 보인다.**
 * `display:none`이라 접근성 트리에도 한쪽만 남는다. `<td>`를 `display:block`으로
 * 굽히는 방식은 표의 의미(행↔열 관계)를 파괴하므로 쓰지 않는다.
 */
export function DataTable<Row>({
  ariaLabel,
  minWidth,
  rows,
  rowKey,
  columns,
  narrow = "scroll",
  fixed = false,
  className,
  rowClassName,
}: {
  /** 표마다 고유한 이름. 같은 화면의 여러 region을 보조기술에서 구분한다. */
  ariaLabel: string;
  minWidth: number;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly Column<Row>[];
  /** 좁은 폭에서 어떻게 굽히는가. 기본은 지금까지의 동작(가로 스크롤). */
  narrow?: "scroll" | "cards";
  fixed?: boolean;
  className?: string;
  rowClassName?: (row: Row) => string;
}) {
  const table = (
    <TableFrame
      ariaLabel={ariaLabel}
      minWidth={minWidth}
      cols={columns.map((c) => c.width)}
      headers={columns.map((c) =>
        c.className ? (
          <span key={c.key} className={cn("block", c.className)}>
            {c.header}
          </span>
        ) : (
          c.header
        ),
      )}
      sort={columns.map((c) => c.sort)}
      fixed={fixed}
      className={className}
    >
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={rowKey(row)}
            className={cn("border-b border-line2 last:border-0", rowClassName?.(row))}
          >
            {columns.map((column, i) => (
              <td
                key={column.key}
                className={cn(
                  tableCellPadding(i, columns.length),
                  "py-2.5",
                  column.className,
                )}
              >
                {column.cell(row, index)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );

  if (narrow === "scroll") return table;

  const cards = (
    <ul>
        {rows.map((row, index) => (
          <CardRow
            key={rowKey(row)}
            row={row}
            index={index}
            columns={columns}
            className={rowClassName?.(row)}
          />
        ))}
    </ul>
  );

  return (
    <div className="@container">
      <div className="@4xl:hidden">{cards}</div>
      <div className="hidden @4xl:block">{table}</div>
    </div>
  );
}

/**
 * 카드 한 장. 생김새를 여기 한 번만 정의한다 — 화면마다 따로 그리면 표 14개가
 * 카드 14벌이 된다.
 */
function CardRow<Row>({
  row,
  index,
  columns,
  className,
}: {
  row: Row;
  index: number;
  columns: readonly Column<Row>[];
  className?: string;
}) {
  const pick = (slot: CardSlot) =>
    columns
      .filter((c) => c.card === slot)
      .map((c) => ({ key: c.key, label: c.cardLabel ?? c.header, node: c.cell(row, index) }))
      // ② 렌더 결과로 판정한다. 열 개수로 세면 셀이 전부 null인 행(취소된 부여의
      //    작업 칸)에도 빈 자리가 생긴다.
      .filter((c) => c.node !== null && c.node !== undefined && c.node !== false);

  const meta = pick("meta");
  const actions = pick("actions");

  return (
    <li className={cn("border-b border-line2 px-5 py-3 last:border-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {pick("title").map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          {pick("trailing").map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>
      </div>

      {meta.length > 0 && (
        <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-mut">
          {meta.map((c) => (
            <div key={c.key} className="flex items-baseline gap-1">
              {c.label !== false && <dt className="text-mut2">{c.label}</dt>}
              <dd>{c.node}</dd>
            </div>
          ))}
        </dl>
      )}

      {actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>
      )}
    </li>
  );
}
