import type { Cell, SheetData } from "write-excel-file/browser";

/**
 * 표를 write-excel-file의 SheetData로 바꾼다. 기본값은 전 셀을 문자열로 강제한다 —
 * 엑셀이 학생코드를 수로 읽으면 앞자리 0이 사라지거나 지수 표기가 된다.
 */

const HEADER_BG = "#dfdfdf"; // --color-line
const HEADER_BG_INFO = "#fafafa"; // --color-soft — 참고 열은 더 연하게

export type StyledSheetOptions = {
  /** 오른쪽 끝 몇 열이 참고 열인가. 머리글 배경을 더 연하게 준다. */
  infoColumnCount?: number;
  /**
   * 머리글 앞에 오는 제목 줄 수. 상벌점 시트는 첫 줄에 조회 범위를 적으므로
   * 머리글이 둘째 줄이다 — 0으로 두면 제목 줄이 머리글로 칠해진다.
   */
  titleRowCount?: number;
  /**
   * 참이면 수를 수 셀로 낸다. 합계를 낼 수 있어야 하는 시트(상벌점 점수)에서 쓴다.
   * 기본값은 거짓 — 명단처럼 「수처럼 보이는 글자」가 섞인 시트가 기본이다.
   */
  keepNumbers?: boolean;
  /**
   * 줄바꿈할 열 번호. 규정 이름처럼 아무리 열을 넓혀도 한 줄에 안 들어가는 열은
   * 접어야 한다 — 접지 않으면 옆 칸이 비었을 땐 덮어쓰고, 차 있을 땐 잘려서
   * 어느 쪽이든 읽을 수 없다.
   */
  wrapColumns?: number[];
};

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

  // 제목 줄은 굵게만 — 배경까지 주면 머리글 띠가 둘로 보인다.
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
      // 접는 열은 위쪽 정렬 — 두 줄이 된 칸 옆에서 한 줄짜리가 가운데 뜨면 줄이 어긋나 보인다.
      return wraps.has(i)
        ? { value: String(cell), type: String, wrap: true, alignVertical: "top" as const }
        : { value: String(cell), type: String };
    }),
  );

  return [...titleRows, headerRow, ...dataRows];
}
