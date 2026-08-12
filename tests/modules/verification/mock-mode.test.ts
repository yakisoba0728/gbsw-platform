import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const countRecentSends = vi.fn();
const expirePending = vi.fn();
const insertCode = vi.fn();
const deleteById = vi.fn();
const sendVerification = vi.fn();

vi.mock("@/modules/verification/verification.repo", () => ({
  countRecentSends,
  expirePending,
  insertCode,
  deleteById,
  findLiveCode: vi.fn(),
  bumpAttempts: vi.fn(),
  expireById: vi.fn(),
  markVerified: vi.fn(),
  findVerified: vi.fn(),
  consume: vi.fn(),
}));
vi.mock("@/modules/verification/verification.sender", () => ({
  sendVerification,
}));

const { isMockVerification, requestCode } = await import(
  "@/modules/verification/verification.service"
);

function setEnv(nodeEnv: string, mock: string | undefined) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("VERIFICATION_MOCK", mock ?? "");
}

beforeEach(() => {
  countRecentSends.mockReset().mockResolvedValue(0);
  expirePending.mockReset();
  insertCode.mockReset().mockResolvedValue({ id: "v1" });
  deleteById.mockReset();
  sendVerification.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("목업 모드 잠금", () => {
  it("운영 빌드에서는 플래그가 켜져 있어도 꺼진다", () => {
    setEnv("production", "true");
    expect(isMockVerification()).toBe(false);
  });

  it("개발 빌드라도 플래그가 없으면 꺼진다", () => {
    setEnv("development", undefined);
    expect(isMockVerification()).toBe(false);

    setEnv("development", "false");
    expect(isMockVerification()).toBe(false);
  });

  it("개발 빌드 + 플래그가 둘 다 맞을 때만 켜진다", () => {
    setEnv("development", "true");
    expect(isMockVerification()).toBe(true);
  });
});

describe("requestCode() 목업 동작", () => {
  it("목업이면 발송을 건너뛰고 코드를 돌려준다", async () => {
    setEnv("development", "true");

    const result = await requestCode("PHONE", "010-1234-5678");

    expect(result.mockCode).toMatch(/^\d{6}$/);
    // 발송사 설정이 안 끝나도 흐름을 눌러볼 수 있어야 한다.
    expect(sendVerification).not.toHaveBeenCalled();
    // 코드 자체는 DB에 남아야 확인 단계가 동작한다.
    expect(insertCode).toHaveBeenCalled();
  });

  it("목업이 아니면 코드를 절대 돌려주지 않는다", async () => {
    setEnv("production", "true");

    const result = await requestCode("PHONE", "010-1234-5678");

    expect(result.mockCode).toBeUndefined();
    expect(sendVerification).toHaveBeenCalled();
  });
});
