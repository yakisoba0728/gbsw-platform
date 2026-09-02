import { describe, expect, it } from "vitest";
import { parseStudentNumber } from "@/lib/student-number";

describe("parseStudentNumber", () => {
  it("4자리를 학년·반·번호로 가른다", () => {
    expect(parseStudentNumber("2305")).toEqual({ grade: 2, classNo: 3, number: 5 });
    expect(parseStudentNumber("1124")).toEqual({ grade: 1, classNo: 1, number: 24 });
    expect(parseStudentNumber("3401")).toEqual({ grade: 3, classNo: 4, number: 1 });
  });

  it("앞뒤 공백은 버린다 — 붙여넣은 값이 그대로 들어온다", () => {
    expect(parseStudentNumber(" 2305 ")).toEqual({ grade: 2, classNo: 3, number: 5 });
  });

  it("4자리가 아니면 학번이 아니다 — 이름·학생코드 검색으로 떨어진다", () => {
    for (const value of ["230", "23055", "", "23", "1"]) {
      expect(parseStudentNumber(value)).toBeNull();
    }
  });

  it("숫자가 아니면 학번이 아니다", () => {
    for (const value of ["A305", "23O5", "2305A", "가나다라"]) {
      expect(parseStudentNumber(value)).toBeNull();
    }
  });

  it("0학년·0반·0번은 없다", () => {
    expect(parseStudentNumber("0305")).toBeNull();
    expect(parseStudentNumber("2005")).toBeNull();
    expect(parseStudentNumber("2300")).toBeNull();
  });
});
