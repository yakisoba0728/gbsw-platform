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

  it("조합형(NFD)과 완성형(NFC)을 같은 문자열로 정규화한다 (I8)", () => {
    const nfd = "홍길동".normalize("NFD");
    const nfc = "홍길동".normalize("NFC");

    expect(nfd).not.toBe(nfc);
    expect(normalizeName(nfd)).toBe(normalizeName(nfc));
    expect(normalizeName(nfd)).toBe(nfc);
  });
});

describe("nameMatches()", () => {
  it("공백 표기가 달라도 같은 이름으로 본다", () => {
    expect(nameMatches("홍길동", " 홍길동 ")).toBe(true);
    expect(nameMatches("홍 길동", "홍  길동")).toBe(true);
  });

  it("조합형·완성형이 섞여도 같은 이름으로 본다 (I8)", () => {
    expect(nameMatches("홍길동".normalize("NFD"), "홍길동".normalize("NFC"))).toBe(
      true,
    );
    expect(nameMatches("홍길동".normalize("NFC"), "홍길동".normalize("NFD"))).toBe(
      true,
    );
  });

  it("다른 이름은 통과시키지 않는다", () => {
    expect(nameMatches("홍길동", "홍길순")).toBe(false);
    expect(nameMatches("홍길동", "홍길")).toBe(false);
    expect(nameMatches("홍길동", "")).toBe(false);
  });

  it("공백을 지운 형태는 다른 이름으로 본다", () => {
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
