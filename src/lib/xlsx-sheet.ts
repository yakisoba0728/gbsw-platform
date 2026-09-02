import type { Cell, SheetData } from "write-excel-file/browser";

const HEADER_BG = "#dfdfdf";
const HEADER_BG_INFO = "#fafafa";

type StyledSheetOptions = {
  infoColumnCount?: number;
  titleRowCount?: number;
  keepNumbers?: boolean;
  wrapColumns?: number[];
};

// 기본 문자열 셀은 학생코드 앞자리 0과 긴 숫자의 표기를 보존한다.
export function toStyledSheetData(
  rows: (string | number | null)[][],
  options: StyledSheetOptions = {},
): SheetData {
  const {
    infoColumnCount = 0,
    titleRowCount = 0,
    keepNumbers = false,
    wrapColumns = [],
  } = options;
  const wraps = new Set(wrapColumns);

  const titles = rows.slice(0, titleRowCount);
  const header = rows[titleRowCount];
  if (!header) return [];
  const data = rows.slice(titleRowCount + 1);

  const titleRows: Cell[][] = titles.map((row) =>
    row.map((cell): Cell => ({
      value: String(cell ?? ""),
      type: String,
      fontWeight: "bold" as const,
    })),
  );

  const headerRow: Cell[] = header.map((h, i) => ({
    value: String(h ?? ""),
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: i >= header.length - infoColumnCount ? HEADER_BG_INFO : HEADER_BG,
  }));

  const dataRows: Cell[][] = data.map((row) =>
    row.map((cell, i): Cell => {
      if (cell === null || cell === "") return null;
      if (keepNumbers && typeof cell === "number") return { value: cell, type: Number };
      return wraps.has(i)
        ? { value: String(cell), type: String, wrap: true, alignVertical: "top" as const }
        : { value: String(cell), type: String };
    }),
  );

  return [...titleRows, headerRow, ...dataRows];
}
