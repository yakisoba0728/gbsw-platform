import type { Cell, SheetData } from "write-excel-file/browser";

/**
 * `(string | number | null)[][]` 표를 write-excel-file이 받는 SheetData로 바꾼다.
 *
 * 명단·초대코드 목록 등 이 앱이 내려주는 표 전부가 같은 규칙을 쓴다:
 * - 첫 줄은 머리글 — 굵게, 회색 배경.
 * - 참고 열(마지막 `infoColumnCount`개)의 머리글만 배경을 더 연하게 — 편집 대상이
 *   아님을 보인다.
 * - 전 셀을 문자열로 강제한다(`type: String`). 엑셀이 학생코드나 번호를 수로 인식하면
 *   앞자리 0이 사라지거나 지수 표기(2E5)가 된다.
 *
 * 색은 src/app/globals.css의 @theme 토큰 값을 그대로 옮겼다 — 새 색을 만들지 않는다.
 * (--color-line, --color-bg)
 */

const HEADER_BG = "#eaecf0"; // --color-line
const HEADER_BG_INFO = "#f5f6f8"; // --color-bg — 참고 열은 더 연하게

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
