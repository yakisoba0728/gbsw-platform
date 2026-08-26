import { describe, expect, it } from "vitest";
import {
  formatSeat,
  formatStudentNumber,
  parseStudentNumber,
} from "@/lib/student-number";

describe("formatStudentNumber()", () => {
  it("학년·반·번호를 4자리로 붙인다", () => {
    expect(formatStudentNumber({ grade: 1, classNo: 3, number: 7 })).toBe("1307");
    expect(formatStudentNumber({ grade: 1, classNo: 3, number: 3 })).toBe("1303");
    expect(formatStudentNumber({ grade: 2, classNo: 3, number: 5 })).toBe("2305");
  });

  it("번호는 두 자리로 채운다 — 자리가 밀리면 남의 학생이 된다", () => {
    expect(formatStudentNumber({ grade: 3, classNo: 1, number: 2 })).toBe("3102");
    expect(formatStudentNumber({ grade: 3, classNo: 1, number: 20 })).toBe("3120");
  });

  it("만든 학번을 그대로 되읽을 수 있다", () => {
    for (const seat of [
      { grade: 1, classNo: 3, number: 7 },
      { grade: 2, classNo: 1, number: 15 },
      { grade: 3, classNo: 9, number: 99 },
    ]) {
      expect(parseStudentNumber(formatStudentNumber(seat)!)).toEqual(seat);
    }
  });

  it("반이 두 자리면 null — 2학년 30반 5번이 2학년 3반 5번으로 읽힌다", () => {
    expect(formatStudentNumber({ grade: 2, classNo: 30, number: 5 })).toBeNull();
    expect(formatStudentNumber({ grade: 2, classNo: 10, number: 5 })).toBeNull();
  });

  it("번호가 세 자리면 null", () => {
    expect(formatStudentNumber({ grade: 1, classNo: 1, number: 100 })).toBeNull();
  });

  it("배정이 없으면 null — 학번은 올해 앉은 자리를 적는 값이다", () => {
    expect(formatStudentNumber({ grade: null, classNo: 3, number: 7 })).toBeNull();
    expect(formatStudentNumber({ grade: 1, classNo: null, number: 7 })).toBeNull();
    expect(formatStudentNumber({ grade: 1, classNo: 3, number: null })).toBeNull();
  });

  it("0학년·0반·0번은 없다", () => {
    expect(formatStudentNumber({ grade: 0, classNo: 3, number: 7 })).toBeNull();
    expect(formatStudentNumber({ grade: 1, classNo: 0, number: 7 })).toBeNull();
    expect(formatStudentNumber({ grade: 1, classNo: 3, number: 0 })).toBeNull();
  });
});

describe("formatSeat()", () => {
  it("줄일 수 있으면 학번이다", () => {
    expect(formatSeat({ grade: 1, classNo: 3, number: 7 })).toBe("1307");
  });

  it("반이 두 자리면 자리를 나눠 적는다 — 줄이면 남의 학생이 된다", () => {
    expect(formatSeat({ grade: 2, classNo: 30, number: 5 })).toBe("2-30 5");
  });

  it("번호가 없으면 반까지만 적는다", () => {
    expect(formatSeat({ grade: 1, classNo: 3, number: null })).toBe("1-3");
  });

  it("배정이 없으면 null — 무슨 말을 넣을지는 화면이 고른다", () => {
    expect(formatSeat({ grade: null, classNo: null, number: null })).toBeNull();
    expect(formatSeat({ grade: 1, classNo: null, number: 7 })).toBeNull();
  });
});
