import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-flash-0123456789";
});

const { issuePassFlash, verifyPassFlash } = await import(
  "@/modules/pass/pass-flash"
);

const NOW = new Date("2026-08-31T06:00:00.000Z");

describe("pass flash", () => {
  it("종류와 사용자를 담은 서명 토큰을 검증한다", () => {
    const token = issuePassFlash("approved", "teacher-1", NOW);

    expect(verifyPassFlash(token, NOW)).toMatchObject({
      kind: "approved",
      userId: "teacher-1",
      issuedAt: NOW.getTime(),
    });
  });

  it("한 글자라도 바뀐 토큰과 임의 문자열은 거부한다", () => {
    const token = issuePassFlash("requested", "student-1", NOW);
    const changed = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifyPassFlash(changed, NOW)).toBeNull();
    expect(verifyPassFlash("requested")).toBeNull();
  });

  it("2분이 지난 토큰과 지나치게 미래인 토큰은 거부한다", () => {
    const token = issuePassFlash("consented", "parent-1", NOW);

    expect(
      verifyPassFlash(token, new Date(NOW.getTime() + 120_001)),
    ).toBeNull();
    expect(
      verifyPassFlash(token, new Date(NOW.getTime() - 5_001)),
    ).toBeNull();
  });

  it("같은 입력도 재생 구분용 nonce 때문에 서로 다른 토큰이 된다", () => {
    expect(issuePassFlash("requested", "student-1", NOW)).not.toBe(
      issuePassFlash("requested", "student-1", NOW),
    );
  });
});
