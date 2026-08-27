import { beforeAll, describe, expect, it } from "vitest";
import { createHmac, hkdfSync } from "node:crypto";

const SECRET = "test-secret-for-pass-token-0123456789";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = SECRET;
});

const { issueStudentCode, verifyStudentCode } = await import(
  "@/modules/pass/pass.token"
);

const PROFILE_ID = "clx0000000000000000000abc";
const OTHER_ID = "clx0000000000000000000xyz";

describe("issueStudentCode", () => {
  it("프로필id.서명 꼴이고 서명은 base64url 16자다", () => {
    const [id, sig] = issueStudentCode(PROFILE_ID).split(".");
    expect(id).toBe(PROFILE_ID);
    expect(sig).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  // **학생증의 성질 그 자체다.** 시간이 지나도 값이 안 바뀐다 — 이게 깨지면
  // 인쇄해 둔 학생증이 어느 날 갑자기 안 통한다.
  it("몇 번을 불러도 같은 값이다", () => {
    expect(issueStudentCode(PROFILE_ID)).toBe(issueStudentCode(PROFILE_ID));
  });

  it("학생이 다르면 코드도 다르다", () => {
    expect(issueStudentCode(PROFILE_ID)).not.toBe(issueStudentCode(OTHER_ID));
  });
});

describe("verifyStudentCode", () => {
  it("제 서명을 통과시킨다", () => {
    expect(verifyStudentCode(issueStudentCode(PROFILE_ID))).toEqual({
      studentProfileId: PROFILE_ID,
    });
  });

  it("서명을 한 글자만 바꿔도 MALFORMED다", () => {
    const [id, sig] = issueStudentCode(PROFILE_ID).split(".");
    const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyStudentCode(`${id}.${flipped}`)).toBe("MALFORMED");
  });

  it("남의 프로필id에 내 서명을 붙이면 MALFORMED다", () => {
    const mine = issueStudentCode(PROFILE_ID).split(".")[1];
    expect(verifyStudentCode(`${OTHER_ID}.${mine}`)).toBe("MALFORMED");
  });

  /**
   * 옛 출입증 QR(`gbsw-pass-qr-v1` 키로 `passId:step`에 서명하던 것)은 통하지
   * 않아야 한다. 키 파생의 info를 갈라 둔 것이 이 성질을 만든다 — 이 검사가
   * 깨진다면 누군가 info를 되돌린 것이다.
   */
  it("옛 출입증 토큰 방식으로 만든 코드는 안 통한다", () => {
    const oldKey = Buffer.from(hkdfSync("sha256", SECRET, "", "gbsw-pass-qr-v1", 32));
    const oldSig = createHmac("sha256", oldKey)
      .update(`${PROFILE_ID}:0`)
      .digest()
      .subarray(0, 12)
      .toString("base64url");
    expect(verifyStudentCode(`${PROFILE_ID}.${oldSig}`)).toBe("MALFORMED");
  });

  it.each([
    ["빈 문자열", ""],
    ["점이 없다", PROFILE_ID],
    ["프로필id가 비었다", ".AAAAAAAAAAAAAAAA"],
    ["서명 길이가 다르다", `${PROFILE_ID}.AAAA`],
    ["프로필id에 못 쓸 글자", "clx-000000000000000000abc.AAAAAAAAAAAAAAAA"],
    ["서명에 못 쓸 글자", `${PROFILE_ID}.AAAAAAAAAAAAAAA+`],
  ])("%s → MALFORMED", (_label, code) => {
    expect(verifyStudentCode(code)).toBe("MALFORMED");
  });
});
