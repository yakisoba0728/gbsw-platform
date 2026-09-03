import { describe, expect, it } from "vitest";
import {
  generateTempPassword,
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_LENGTH,
} from "@/modules/admin-users/temp-password";

describe("generateTempPassword()", () => {
  it("기본 길이는 14자다", () => {
    expect(generateTempPassword()).toHaveLength(TEMP_PASSWORD_LENGTH);
  });

  it("혼동하기 쉬운 글자를 알파벳에서 뺐다", () => {
    for (const bad of ["0", "O", "1", "I", "l"]) {
      expect(TEMP_PASSWORD_ALPHABET).not.toContain(bad);
    }
  });

  it("알파벳 밖의 글자는 나오지 않는다", () => {
    const allowed = new Set(TEMP_PASSWORD_ALPHABET);
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateTempPassword()) {
        expect(allowed.has(char)).toBe(true);
      }
    }
  });

  it("대문자·소문자·숫자를 각각 최소 하나 포함한다", () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTempPassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[2-9]/);
    }
  });

  it("연달아 뽑아도 겹치지 않는다", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateTempPassword()));
    expect(set.size).toBe(500);
  });

  it("앞 세 자리가 항상 대·소·숫자 순으로 고정되지 않는다", () => {
    const firsts = new Set(
      Array.from({ length: 200 }, () => {
        const c = generateTempPassword()[0]!;
        return /[A-Z]/.test(c) ? "U" : /[a-z]/.test(c) ? "L" : "D";
      }),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });
});
