import type { AriaAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TableFrame({
  minWidth,
  cols,
  headers,
  sort,
  fixed = false,
  gutter = true,
  className,
  children,
}: {
  minWidth: number;
  cols?: readonly (string | undefined)[];
  headers: readonly ReactNode[];
  sort?: readonly (AriaAttributes["aria-sort"] | undefined)[];
  fixed?: boolean;
  gutter?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("scroll-x-hint overflow-x-auto rounded-b-card", className)}>
      <table
        className={cn(
          "w-full text-left text-sm",
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
    </div>
  );
}

// 카드 여백에 맞춰 기본 패딩은 첫·끝 열 px-5, 나머지 px-3으로 둔다.
export function tableCellPadding(
  index: number,
  count: number,
  gutter = true,
): string {
  const edge = index === 0 || index === count - 1;
  if (!gutter) return edge ? (index === 0 ? "pr-3" : "pl-3") : "px-3";
  return edge ? "px-5" : "px-3";
}

export type CardSlot = "title" | "trailing" | "meta" | "actions";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  width?: string;
  sort?: AriaAttributes["aria-sort"];
  card?: CardSlot;
  cardLabel?: ReactNode | false;
  className?: string;
};

export function DataTable<Row>({
  minWidth,
  rows,
  rowKey,
  columns,
  narrow = "scroll",
  fixed = false,
  className,
  rowClassName,
}: {
  minWidth: number;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly Column<Row>[];
  narrow?: "scroll" | "cards";
  fixed?: boolean;
  className?: string;
  rowClassName?: (row: Row) => string;
}) {
  const table = (
    <TableFrame
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
    <>
      <div className="lg:hidden">{cards}</div>
      <div className="hidden lg:block">{table}</div>
    </>
  );
}

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
