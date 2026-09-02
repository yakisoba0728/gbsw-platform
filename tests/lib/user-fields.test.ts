import { describe, expect, it } from "vitest";
import { emailField, phoneField } from "@/lib/user-fields";

describe("phoneField", () => {
  it("어떻게 넣든 010-0000-0000 표기로 저장한다", () => {
    for (const input of [
      "01012345678",
      "010-1234-5678",
      "010 1234 5678",
      "  010-1234-5678  ",
    ]) {
      expect(phoneField.parse(input)).toBe("010-1234-5678");
    }
  });

  it("국번이 3자리인 옛 번호도 받는다", () => {
    expect(phoneField.parse("0111234567")).toBe("011-123-4567");
  });

  it("휴대폰이 아니거나 자릿수가 어긋나면 거부한다", () => {
    for (const bad of ["", "0212345678", "010-123-456", "010-12345-6789", "abcd"]) {
      expect(phoneField.safeParse(bad).success).toBe(false);
    }
  });
});

describe("emailField", () => {
  it("공백을 떼고 소문자로 맞춘다", () => {
    expect(emailField.parse("  Admin@GBSW.hs.KR ")).toBe("admin@gbsw.hs.kr");
  });

  it("비어 있거나 형식이 아니면 거부한다", () => {
    for (const bad of ["", "   ", "admin", "admin@", "@gbsw.hs.kr"]) {
      expect(emailField.safeParse(bad).success).toBe(false);
    }
  });
});
