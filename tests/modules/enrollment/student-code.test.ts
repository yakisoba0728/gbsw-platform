import { describe, expect, it } from "vitest";
import { generateStudentCode, isStudentCode, STUDENT_CODE_ALPHABET, STUDENT_CODE_LENGTH } from "@/modules/enrollment/student-code";

describe("generateStudentCode()", () => {
  it("정해진 길이와 알파벳만 쓴다", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateStudentCode();
      expect(id).toHaveLength(STUDENT_CODE_LENGTH);
      for (const ch of id) expect(STUDENT_CODE_ALPHABET).toContain(ch);
    }
  });

  it("헷갈리는 글자를 쓰지 않는다 — 종이로 옮겨 적는 값이다", () => {
    expect(STUDENT_CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it("항상 글자로 시작한다 — 숫자로 시작하면 엑셀이 수로 바꿔 앞자리 0을 먹는다", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateStudentCode()[0]).toMatch(/[A-Z]/);
    }
  });

  it("같은 값이 잘 나오지 않는다", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateStudentCode()));
    expect(seen.size).toBe(500);
  });
});

describe("isStudentCode()", () => {
  it("생성한 값을 받아들인다", () => {
    expect(isStudentCode(generateStudentCode())).toBe(true);
  });

  it("길이·알파벳이 어긋나면 거부한다", () => {
    expect(isStudentCode("")).toBe(false);
    expect(isStudentCode("ABC")).toBe(false);
    expect(isStudentCode("abcdefgh")).toBe(false);
    expect(isStudentCode("A1BCDEFG")).toBe(false);
    expect(isStudentCode(null)).toBe(false);
  });
});
