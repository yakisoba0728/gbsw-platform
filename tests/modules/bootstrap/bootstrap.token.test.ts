import { beforeEach, describe, expect, it } from "vitest";
import {
  clearToken,
  consumeToken,
  issueToken,
  matchesToken,
  restoreToken,
} from "@/modules/bootstrap/bootstrap.token";

describe("부트스트랩 토큰", () => {
  beforeEach(() => clearToken());

  it("발급 전에는 어떤 값도 통과하지 못한다", () => {
    expect(matchesToken("")).toBe(false);
    expect(matchesToken("아무값")).toBe(false);
    expect(consumeToken("아무값")).toBe(false);
  });

  it("발급된 토큰만 통과한다", () => {
    const token = issueToken();

    expect(matchesToken(token)).toBe(true);
    expect(matchesToken(`${token}x`)).toBe(false);
    expect(matchesToken("전혀 다른 값")).toBe(false);
  });

  it("길이가 다른 입력에도 예외 없이 false를 준다", () => {
    issueToken();
    // timingSafeEqual은 길이가 다르면 던지므로 방어되어 있어야 한다.
    expect(() => matchesToken("짧음")).not.toThrow();
    expect(matchesToken("짧음")).toBe(false);
  });

  it("소진은 한 번만 성공한다 — 동시 요청 방어의 핵심", () => {
    const token = issueToken();

    expect(consumeToken(token)).toBe(true);
    expect(consumeToken(token)).toBe(false);
    expect(matchesToken(token)).toBe(false);
  });

  it("복원하면 다시 쓸 수 있다", () => {
    const token = issueToken();
    consumeToken(token);

    restoreToken(token);

    expect(matchesToken(token)).toBe(true);
  });

  it("재발급하면 이전 토큰이 무효가 된다", () => {
    const first = issueToken();
    const second = issueToken();

    expect(first).not.toBe(second);
    expect(matchesToken(first)).toBe(false);
    expect(matchesToken(second)).toBe(true);
  });

  it("토큰은 URL에 그대로 넣을 수 있는 형식이다", () => {
    const token = issueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 256비트를 base64url로 인코딩하면 43자.
    expect(token).toHaveLength(43);
  });
});
