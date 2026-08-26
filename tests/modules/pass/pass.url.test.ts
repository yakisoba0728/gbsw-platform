import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_URL = "https://gbsw.example.kr";
});

const { buildScanUrl, tokenFromScanUrl } = await import("@/modules/pass/pass.url");

const ORIGIN = "https://gbsw.example.kr";
const TOKEN = "clx0000000000000000000abc.AAAAAAAAAAAAAAAA";

describe("buildScanUrl", () => {
  it("판독 화면 자신을 가리킨다", () => {
    expect(buildScanUrl(TOKEN)).toBe(`${ORIGIN}/scan?c=${TOKEN}`);
  });
});

describe("tokenFromScanUrl", () => {
  it("우리 주소면 토큰을 꺼낸다", () => {
    expect(tokenFromScanUrl(`${ORIGIN}/scan?c=${TOKEN}`, ORIGIN)).toBe(TOKEN);
  });

  it.each([
    ["남의 출처", `https://evil.example/scan?c=${TOKEN}`],
    ["우리 도메인의 다른 경로", `${ORIGIN}/login?c=${TOKEN}`],
    ["c가 없다", `${ORIGIN}/scan`],
    ["c가 비었다", `${ORIGIN}/scan?c=`],
    ["주소가 아니다", "그냥 글자"],
    ["다른 스킴", `javascript:alert(1)`],
  ])("%s → null (읽은 주소로 이동하지 않는다)", (_label, text) => {
    expect(tokenFromScanUrl(text, ORIGIN)).toBeNull();
  });

  it("터무니없이 긴 값은 안 받는다", () => {
    expect(tokenFromScanUrl(`${ORIGIN}/scan?c=${"a".repeat(200)}`, ORIGIN)).toBeNull();
  });
});
