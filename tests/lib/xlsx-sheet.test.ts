import { describe, expect, it } from "vitest";
import type { CellObject } from "write-excel-file/browser";
import { toStyledSheetData } from "@/lib/xlsx-sheet";

/** 헤더 셀은 항상 CellObject다 — 테스트에서만 좁혀서 backgroundColor에 접근한다. */
const asCellObject = (cell: unknown) => cell as CellObject;

describe("toStyledSheetData()", () => {
  it("머리글 행을 굵게 + 회색 배경으로 만든다", () => {
    const [header] = toStyledSheetData([["이름", "학년"], ["김동혁", "1"]]);
    expect(header).toEqual([
      { value: "이름", type: String, fontWeight: "bold", backgroundColor: "#dfdfdf" },
      { value: "학년", type: String, fontWeight: "bold", backgroundColor: "#dfdfdf" },
    ]);
  });

  it("infoColumnCount만큼 마지막 머리글 칸은 더 연한 배경이다", () => {
    const [header] = toStyledSheetData(
      [["이름", "학년", "입학반"]],
      { infoColumnCount: 1 },
    );
    expect(asCellObject(header![0]).backgroundColor).toBe("#dfdfdf");
    expect(asCellObject(header![1]).backgroundColor).toBe("#dfdfdf");
    expect(asCellObject(header![2]).backgroundColor).toBe("#fafafa");
  });

  it("모든 값을 type: String으로 강제한다 — 엑셀이 수로 읽지 않도록", () => {
    const [, row] = toStyledSheetData([["학생코드", "번호"], ["AAAA1111", 7]]);
    expect(row).toEqual([
      { value: "AAAA1111", type: String },
      { value: "7", type: String },
    ]);
  });

  it("빈 칸(null·빈 문자열)은 빈 셀로 둔다", () => {
    const [, row] = toStyledSheetData([["학년"], [null]]);
    expect(row).toEqual([null]);

    const [, row2] = toStyledSheetData([["학년"], [""]]);
    expect(row2).toEqual([null]);
  });

  it("행이 없으면 빈 SheetData를 돌려준다", () => {
    expect(toStyledSheetData([])).toEqual([]);
  });

  it("제목 줄이 있으면 머리글 띠는 그 다음 줄에 간다", () => {
    const [title, header, row] = toStyledSheetData(
      [["2026학년도 · 교내"], ["이름", "점수"], ["김민준", 5]],
      { titleRowCount: 1 },
    );
    // 제목은 굵게만 — 배경까지 주면 머리글 띠가 둘로 보인다.
    expect(title).toEqual([
      { value: "2026학년도 · 교내", type: String, fontWeight: "bold" },
    ]);
    expect(header?.[0]).toMatchObject({ value: "이름", backgroundColor: "#dfdfdf" });
    expect(row?.[0]).toMatchObject({ value: "김민준" });
  });

  it("keepNumbers면 수를 수 셀로 낸다 — 열을 더할 수 있어야 한다", () => {
    const [, row] = toStyledSheetData([["점수"], [-3]], { keepNumbers: true });
    expect(row?.[0]).toEqual({ value: -3, type: Number });
  });

  it("keepNumbers가 없으면 지금까지처럼 글자로 낸다", () => {
    const [, row] = toStyledSheetData([["번호"], [7]]);
    expect(row?.[0]).toEqual({ value: "7", type: String });
  });

  it("wrapColumns로 지정한 열만 접는다", () => {
    const [, row] = toStyledSheetData(
      [["항목", "점수"], ["아주 긴 규정 이름", "2"]],
      { wrapColumns: [0] },
    );
    expect(row?.[0]).toMatchObject({ wrap: true, alignVertical: "top" });
    expect(row?.[1]).not.toHaveProperty("wrap");
  });
});
