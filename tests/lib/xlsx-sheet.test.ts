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
});
