import type { Cell, SheetData } from "write-excel-file/browser";

/**
 * 표를 write-excel-file의 SheetData로 바꾼다. 전 셀을 문자열로 강제한다 —
 * 엑셀이 학생코드를 수로 읽으면 앞자리 0이 사라지거나 지수 표기가 된다.
 */

const HEADER_BG = "#dfdfdf"; // --color-line
const HEADER_BG_INFO = "#fafafa"; // --color-soft — 참고 열은 더 연하게

export function toStyledSheetData(
  rows: (string | number | null)[][],
  options: { infoColumnCount?: number } = {},
): SheetData {
  const infoColumnCount = options.infoColumnCount ?? 0;
  const [header, ...data] = rows;
  if (!header) return [];

  const headerRow: Cell[] = header.map((h, i) => ({
    value: String(h ?? ""),
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: i >= header.length - infoColumnCount ? HEADER_BG_INFO : HEADER_BG,
  }));

  const dataRows: Cell[][] = data.map((row) =>
    row.map((cell): Cell =>
      cell === null || cell === "" ? null : { value: String(cell), type: String },
    ),
  );

  return [headerRow, ...dataRows];
}
