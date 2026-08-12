import { describe, expect, it } from "vitest";
import {
  birthDateMatches,
  nameMatches,
  normalizeName,
} from "@/modules/registration/registration.verify";

describe("normalizeName()", () => {
  it("앞뒤 공백을 없애고 내부 연속 공백을 하나로 줄인다", () => {
    expect(normalizeName("  홍길동  ")).toBe("홍길동");
    expect(normalizeName("홍  길동")).toBe("홍 길동");
    expect(normalizeName(" 홍 길동 ")).toBe("홍 길동");
  });
});

describe("nameMatches()", () => {
  it("공백 표기가 달라도 같은 이름으로 본다", () => {
    expect(nameMatches("홍길동", " 홍길동 ")).toBe(true);
    expect(nameMatches("홍 길동", "홍  길동")).toBe(true);
  });

  it("다른 이름은 통과시키지 않는다", () => {
    expect(nameMatches("홍길동", "홍길순")).toBe(false);
    expect(nameMatches("홍길동", "홍길")).toBe(false);
    expect(nameMatches("홍길동", "")).toBe(false);
  });

  it("공백을 지운 형태는 다른 이름으로 본다", () => {
    // "홍 길동"과 "홍길동"은 서로 다른 표기이므로 관리자가 등록한 대로 입력해야 한다.
    expect(nameMatches("홍 길동", "홍길동")).toBe(false);
  });
});

describe("birthDateMatches()", () => {
  it("YYYY-MM-DD가 완전히 같아야 통과한다", () => {
    expect(birthDateMatches("2010-03-04", "2010-03-04")).toBe(true);
    expect(birthDateMatches("2010-03-04", " 2010-03-04 ")).toBe(true);
  });

  it("자리수가 다르거나 값이 다르면 거부한다", () => {
    expect(birthDateMatches("2010-03-04", "2010-3-4")).toBe(false);
    expect(birthDateMatches("2010-03-04", "2010-03-05")).toBe(false);
    expect(birthDateMatches("2010-03-04", "")).toBe(false);
  });
});
