import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consoleSender,
  maskEmail,
  sendVerification,
} from "@/modules/verification/verification.sender";

describe("maskEmail()", () => {
  it("로컬파트 앞 두 글자만 남기고 가린다", () => {
    expect(maskEmail("ab12cd@gbsw.hs.kr")).toBe("ab***@gbsw.hs.kr");
  });

  it("로컬파트가 짧으면 통째로 가린다", () => {
    expect(maskEmail("a@gbsw.hs.kr")).toBe("***@gbsw.hs.kr");
    expect(maskEmail("ab@gbsw.hs.kr")).toBe("***@gbsw.hs.kr");
  });

  it("이메일 형식이 아니면 통째로 가린다", () => {
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("consoleSender()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("코드는 절대 로그에 남기지 않고, 대상은 가려서 찍는다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await consoleSender({
      channel: "EMAIL",
      target: "ab12cd@gbsw.hs.kr",
      code: "654321",
    });

    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("654321");
    expect(logged).toContain("ab***@gbsw.hs.kr");
    expect(logged).not.toContain("ab12cd@gbsw.hs.kr");
  });
});

describe("sendVerification() — EMAIL 채널의 운영/개발 분기", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("운영에서는 콘솔로 조용히 흘려보내지 않고 던진다", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      sendVerification({
        channel: "EMAIL",
        target: "a@gbsw.hs.kr",
        code: "123456",
      }),
    ).rejects.toThrow();
  });

  it("개발에서는 지금처럼 콘솔로 내려간다 (코드는 안 남긴다)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendVerification({
      channel: "EMAIL",
      target: "ab12cd@gbsw.hs.kr",
      code: "654321",
    });

    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("654321");
    expect(logged).toContain("ab***@gbsw.hs.kr");
  });
});

describe("sendVerification() — PHONE 채널의 운영 안전장치", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("알리고 설정이 없는 운영에서는 콘솔 성공으로 가장하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      sendVerification({
        channel: "PHONE",
        target: "010-1234-5678",
        code: "123456",
      }),
    ).rejects.toThrow("발송 수단이 설정되지 않았습니다");
  });
});
