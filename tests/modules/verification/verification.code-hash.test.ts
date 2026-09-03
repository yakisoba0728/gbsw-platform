import { createHash } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-verification-0123456789";
});

const { hashVerificationCode, verificationCodeMatches } = await import(
  "@/modules/verification/verification.code-hash"
);

const CODE = "123456";
const EMAIL = "a@b.kr";
const PHONE = "010-1234-5678";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hashVerificationCode()", () => {
  it("코드 원본을 그대로 담지 않는다", () => {
    const hash = hashVerificationCode("EMAIL", EMAIL, CODE);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(CODE);
  });

  it("평문 SHA-256과 다르다 — 비밀 없이 만든 후보 해시는 대조에 쓸 수 없다", () => {
    const plain = createHash("sha256").update(CODE).digest("hex");

    expect(hashVerificationCode("EMAIL", EMAIL, CODE)).not.toBe(plain);
    expect(verificationCodeMatches(plain, "EMAIL", EMAIL, CODE)).toBe(false);
  });

  it("같은 코드라도 채널이 다르면 해시가 다르다", () => {
    expect(hashVerificationCode("EMAIL", PHONE, CODE)).not.toBe(
      hashVerificationCode("PHONE", PHONE, CODE),
    );
  });

  it("같은 코드라도 대상이 다르면 해시가 다르다 — 행 사이 해시 옮겨심기를 막는다", () => {
    const forOne = hashVerificationCode("EMAIL", EMAIL, CODE);

    expect(hashVerificationCode("EMAIL", "other@b.kr", CODE)).not.toBe(forOne);
    expect(verificationCodeMatches(forOne, "EMAIL", "other@b.kr", CODE)).toBe(
      false,
    );
  });

  it("서버 비밀이 다르면 해시가 다르다 — 비밀 없이는 후보를 대조할 수 없다", () => {
    const withOwnSecret = hashVerificationCode("EMAIL", EMAIL, CODE);

    vi.stubEnv("BETTER_AUTH_SECRET", "another-secret-0123456789-abcdefgh");

    expect(hashVerificationCode("EMAIL", EMAIL, CODE)).not.toBe(withOwnSecret);
  });

  it("비밀이 없으면 던진다 — 화면에 그대로 나가는 VerificationError가 아니다", async () => {
    const { VerificationError } = await import(
      "@/modules/verification/verification.error"
    );
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(() => hashVerificationCode("EMAIL", EMAIL, CODE)).toThrow(
      "BETTER_AUTH_SECRET",
    );
    try {
      hashVerificationCode("EMAIL", EMAIL, CODE);
    } catch (error) {
      expect(error).not.toBeInstanceOf(VerificationError);
    }
  });
});

describe("verificationCodeMatches()", () => {
  it("같은 채널·대상·코드면 통과시킨다", () => {
    const hash = hashVerificationCode("PHONE", PHONE, CODE);

    expect(verificationCodeMatches(hash, "PHONE", PHONE, CODE)).toBe(true);
  });

  it("코드가 다르면 거절한다", () => {
    const hash = hashVerificationCode("PHONE", PHONE, CODE);

    expect(verificationCodeMatches(hash, "PHONE", PHONE, "000000")).toBe(false);
  });

  it("길이가 다른 옛 값과 비교해도 던지지 않고 거절한다", () => {
    expect(
      verificationCodeMatches(
        "temporary-verification-bypass",
        "EMAIL",
        EMAIL,
        CODE,
      ),
    ).toBe(false);
  });
});
