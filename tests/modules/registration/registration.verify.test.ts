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
    // "홍길동"을 유니코드 조합형(자모 분리)으로 인코딩한 문자열 — macOS
    // 도구를 거친 파일·입력에서 섞여 들어올 수 있다.
    const nfd = "홍길동".normalize("NFD");
    const nfc = "홍길동".normalize("NFC");

    expect(nfd).not.toBe(nfc); // 전제 확인 — 바이트 자체가 다르다.
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
    // 관리자가 초대코드를 만들 때 입력한 이름(NFD일 수 있다)과 학생이 가입
    // 화면에서 타이핑한 이름(NFC일 수 있다)이 눈엔 같아도 대조가 실패해
    // 5회 만에 초대코드가 자동 폐기되던 문제.
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
