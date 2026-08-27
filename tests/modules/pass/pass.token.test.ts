import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
});

const { issueStudentCode, verifyStudentCode, STEP_SECONDS } = await import(
  "@/modules/pass/pass.token"
);

const PROFILE_ID = "clx0000000000000000000abc";
const OTHER_ID = "clx0000000000000000000xyz";
const AT = new Date("2026-08-27T05:30:00.000Z");

function plus(seconds: number): Date {
  return new Date(AT.getTime() + seconds * 1000);
}

describe("issueStudentCode", () => {
  it("프로필id.서명 꼴이고 서명은 base64url 16자다", () => {
    const [id, sig] = issueStudentCode(PROFILE_ID, AT).code.split(".");
    expect(id).toBe(PROFILE_ID);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("validUntil은 이번 스텝의 끝이다", () => {
    const { validUntil } = issueStudentCode(PROFILE_ID, AT);
    expect(validUntil.getTime() % (STEP_SECONDS * 1000)).toBe(0);
    expect(validUntil.getTime()).toBeGreaterThan(AT.getTime());
    expect(validUntil.getTime() - AT.getTime()).toBeLessThanOrEqual(
      STEP_SECONDS * 1000,
    );
  });

  // **찍어 둔 사진을 못 쓰게 하는 성질이다.** 이게 깨지면 학생증이 다시
  // 고정 코드가 된다.
  it("20초가 지나면 다른 코드가 나온다", () => {
    expect(issueStudentCode(PROFILE_ID, AT).code).not.toBe(
      issueStudentCode(PROFILE_ID, plus(STEP_SECONDS)).code,
    );
  });

  it("같은 스텝 안에서는 같은 코드다", () => {
    const step = Math.floor(AT.getTime() / 1000 / STEP_SECONDS);
    const start = new Date(step * STEP_SECONDS * 1000);
    const end = new Date((step + 1) * STEP_SECONDS * 1000 - 1);
    expect(issueStudentCode(PROFILE_ID, start).code).toBe(
      issueStudentCode(PROFILE_ID, end).code,
    );
  });

  it("학생이 다르면 코드도 다르다", () => {
    expect(issueStudentCode(PROFILE_ID, AT).code).not.toBe(
      issueStudentCode(OTHER_ID, AT).code,
    );
  });
});

describe("verifyStudentCode", () => {
  it("이번 스텝의 코드를 통과시킨다", () => {
    const { code } = issueStudentCode(PROFILE_ID, AT);
    expect(verifyStudentCode(code, AT)).toEqual({ studentProfileId: PROFILE_ID });
  });

  it("직전 스텝의 코드도 통과시킨다 (시계 오차)", () => {
    const { code } = issueStudentCode(PROFILE_ID, AT);
    expect(verifyStudentCode(code, plus(STEP_SECONDS))).toEqual({
      studentProfileId: PROFILE_ID,
    });
  });

  it("두 스텝 전은 STALE이다", () => {
    const { code } = issueStudentCode(PROFILE_ID, AT);
    expect(verifyStudentCode(code, plus(STEP_SECONDS * 2))).toBe("STALE");
  });

  it("다음 스텝의 코드는 안 받는다 — 창을 넓혀 얻을 게 없다", () => {
    const { code } = issueStudentCode(PROFILE_ID, plus(STEP_SECONDS));
    expect(verifyStudentCode(code, AT)).toBe("STALE");
  });

  it("서명을 한 글자만 바꿔도 STALE이다", () => {
    const [id, sig] = issueStudentCode(PROFILE_ID, AT).code.split(".");
    const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyStudentCode(`${id}.${flipped}`, AT)).toBe("STALE");
  });

  it("남의 프로필id에 내 서명을 붙이면 STALE이다", () => {
    const mine = issueStudentCode(PROFILE_ID, AT).code.split(".")[1];
    expect(verifyStudentCode(`${OTHER_ID}.${mine}`, AT)).toBe("STALE");
  });

  it.each([
    ["빈 문자열", ""],
    ["점이 없다", PROFILE_ID],
    ["프로필id가 비었다", ".AAAAAAAAAAAAAAAA"],
    ["서명 길이가 다르다", `${PROFILE_ID}.AAAA`],
    ["프로필id에 못 쓸 글자", "clx-000000000000000000abc.AAAAAAAAAAAAAAAA"],
    ["서명에 못 쓸 글자", `${PROFILE_ID}.AAAAAAAAAAAAAAA+`],
  ])("%s → MALFORMED", (_label, code) => {
    expect(verifyStudentCode(code, AT)).toBe("MALFORMED");
  });
});
