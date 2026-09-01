import { describe, expect, it } from "vitest";
import {
  countSignificant,
  formatInviteCodeInput,
  formatPhone,
  formatVerificationCode,
  offsetAfterSignificant,
} from "@/lib/masks";

describe("formatPhone()", () => {
  it("치는 도중에도 자연스럽게 끊어준다", () => {
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("0101")).toBe("010-1");
    expect(formatPhone("0101234")).toBe("010-1234");
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
  });

  it("붙여넣기로 들어온 어떤 표기든 같은 결과가 된다", () => {
    for (const pasted of [
      "01012345678",
      "010-1234-5678",
      "010 1234 5678",
      // 스스로 치환해 넘기면 안 된다 — 그러면 국제 표기를 한 번도 안 태운다.
      "+82 10-1234-5678",
      "+821012345678",
      "0082 10-1234-5678",
    ]) {
      expect(formatPhone(pasted)).toBe("010-1234-5678");
    }
  });

  it("11자리를 넘겨도 잘라낸다", () => {
    expect(formatPhone("010123456789999")).toBe("010-1234-5678");
  });

  it("구형 10자리는 3-3-4로 끊는다", () => {
    expect(formatPhone("0111234567")).toBe("011-123-4567");
  });
});

describe("formatInviteCodeInput()", () => {
  it("소문자·하이픈 없이 붙여넣어도 서식이 잡힌다", () => {
    expect(formatInviteCodeInput("gbsw3hh25nfk")).toBe("GBSW-3HH2-5NFK");
    expect(formatInviteCodeInput("GBSW-3HH2-5NFK")).toBe("GBSW-3HH2-5NFK");
  });

  it("앞머리를 빼고 쳐도 끊어준다", () => {
    expect(formatInviteCodeInput("3hh25nfk")).toBe("3HH2-5NFK");
  });

  it("빈 값은 그대로 둔다 (placeholder가 보여야 한다)", () => {
    expect(formatInviteCodeInput("")).toBe("");
  });

  it("치는 도중 값이 사라지지 않는다", () => {
    expect(formatInviteCodeInput("G")).toBe("G");
    expect(formatInviteCodeInput("GBSW")).toBe("GBSW");
    expect(formatInviteCodeInput("GBSW3")).toBe("GBSW-3");
  });

  it("영숫자 개수를 바꾸지 않는다 — 커서 복원의 전제", () => {
    for (const raw of ["gbsw3hh2", "3hh25nfk", "GBSW-3HH2-5NFK", "a1"]) {
      const formatted = formatInviteCodeInput(raw);
      expect(countSignificant(formatted)).toBe(countSignificant(raw));
    }
  });
});

describe("formatVerificationCode()", () => {
  it("숫자 6자리만 남긴다", () => {
    expect(formatVerificationCode("12a3b4c5d6e7")).toBe("123456");
    expect(formatVerificationCode("12 34 56")).toBe("123456");
  });
});

describe("커서 복원", () => {
  it("영숫자 n개를 지난 지점을 찾는다", () => {
    // "010-1234-5678" 에서 숫자 3개를 지난 지점은 하이픈 앞이다.
    expect(offsetAfterSignificant("010-1234-5678", 3)).toBe(3);
    expect(offsetAfterSignificant("010-1234-5678", 4)).toBe(5);
    expect(offsetAfterSignificant("010-1234-5678", 0)).toBe(0);
  });

  it("개수가 넘치면 끝으로 보낸다", () => {
    expect(offsetAfterSignificant("010-1", 99)).toBe(5);
  });
});
