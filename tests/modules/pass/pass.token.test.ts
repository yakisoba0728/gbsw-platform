import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
});

const { issueToken, verifyToken, STEP_SECONDS } = await import(
  "@/modules/pass/pass.token"
);

const PASS_ID = "clx0000000000000000000abc";
const AT = new Date("2026-08-27T05:30:00.000Z");

function plus(seconds: number): Date {
  return new Date(AT.getTime() + seconds * 1000);
}

describe("issueToken", () => {
  it("passId.서명 꼴이고 서명은 base64url 16자다", () => {
    const { token } = issueToken(PASS_ID, AT);
    const [id, sig] = token.split(".");
    expect(id).toBe(PASS_ID);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("validUntil은 이번 스텝의 끝이다", () => {
    const { validUntil } = issueToken(PASS_ID, AT);
    expect(validUntil.getTime() % (STEP_SECONDS * 1000)).toBe(0);
    expect(validUntil.getTime()).toBeGreaterThan(AT.getTime());
    expect(validUntil.getTime() - AT.getTime()).toBeLessThanOrEqual(STEP_SECONDS * 1000);
  });

  it("20초가 지나면 다른 토큰이 나온다", () => {
    expect(issueToken(PASS_ID, AT).token).not.toBe(
      issueToken(PASS_ID, plus(STEP_SECONDS)).token,
    );
  });

  it("같은 스텝 안에서는 같은 토큰이다", () => {
    const step = Math.floor(AT.getTime() / 1000 / STEP_SECONDS);
    const start = new Date(step * STEP_SECONDS * 1000);
    const end = new Date((step + 1) * STEP_SECONDS * 1000 - 1);
    expect(issueToken(PASS_ID, start).token).toBe(issueToken(PASS_ID, end).token);
  });

  it("출입증이 다르면 토큰도 다르다", () => {
    expect(issueToken(PASS_ID, AT).token).not.toBe(
      issueToken("clx0000000000000000000xyz", AT).token,
    );
  });
});

describe("verifyToken", () => {
  it("이번 스텝의 토큰을 통과시킨다", () => {
    const { token } = issueToken(PASS_ID, AT);
    expect(verifyToken(token, AT)).toEqual({ passId: PASS_ID });
  });

  it("직전 스텝의 토큰도 통과시킨다 (시계 오차)", () => {
    const { token } = issueToken(PASS_ID, AT);
    expect(verifyToken(token, plus(STEP_SECONDS))).toEqual({ passId: PASS_ID });
  });

  it("두 스텝 전은 STALE이다", () => {
    const { token } = issueToken(PASS_ID, AT);
    expect(verifyToken(token, plus(STEP_SECONDS * 2))).toBe("STALE");
  });

  it("다음 스텝의 토큰은 안 받는다 — 창을 넓혀 얻을 게 없다", () => {
    const { token } = issueToken(PASS_ID, plus(STEP_SECONDS));
    expect(verifyToken(token, AT)).toBe("STALE");
  });

  it("서명을 한 글자만 바꿔도 STALE이다", () => {
    const { token } = issueToken(PASS_ID, AT);
    const [id, sig] = token.split(".");
    const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyToken(`${id}.${flipped}`, AT)).toBe("STALE");
  });

  it("남의 passId에 내 서명을 붙이면 STALE이다", () => {
    const mine = issueToken(PASS_ID, AT).token.split(".")[1];
    expect(verifyToken(`clx0000000000000000000xyz.${mine}`, AT)).toBe("STALE");
  });

  it.each([
    ["빈 문자열", ""],
    ["점이 없다", "clx0000000000000000000abc"],
    ["passId가 비었다", ".AAAAAAAAAAAAAAAA"],
    ["서명 길이가 다르다", "clx0000000000000000000abc.AAAA"],
    ["passId에 못 쓸 글자", "clx-000000000000000000abc.AAAAAAAAAAAAAAAA"],
    ["서명에 못 쓸 글자", "clx0000000000000000000abc.AAAAAAAAAAAAAAA+"],
  ])("%s → MALFORMED", (_label, token) => {
    expect(verifyToken(token, AT)).toBe("MALFORMED");
  });
});
