import { beforeEach, describe, expect, it, vi } from "vitest";

const countRecentSends = vi.fn();
const countRecentSendsByIp = vi.fn();
const expirePending = vi.fn();
const insertCode = vi.fn();
const findLiveCode = vi.fn();
const bumpAttempts = vi.fn();
const expireById = vi.fn();
const markVerified = vi.fn();
const findVerified = vi.fn();
const consume = vi.fn();
const deleteById = vi.fn();
const sendVerification = vi.fn();
const readRequestContext = vi.fn();

vi.mock("@/modules/verification/verification.repo", () => ({
  countRecentSends,
  countRecentSendsByIp,
  expirePending,
  insertCode,
  findLiveCode,
  bumpAttempts,
  expireById,
  markVerified,
  findVerified,
  consume,
  deleteById,
}));
vi.mock("@/modules/verification/verification.sender", () => ({
  sendVerification,
}));
// requestCode()가 IP별 한도(I4)를 보려고 접속 정보를 읽는다. next/headers는
// 요청 컨텍스트 밖(테스트)에서 못 쓰므로 읽기 함수만 갈아끼운다.
vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

const { confirmCode, requestCode, requireVerified } = await import(
  "@/modules/verification/verification.service"
);

const { createHash } = await import("node:crypto");
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

beforeEach(() => {
  countRecentSends.mockReset().mockResolvedValue(0);
  countRecentSendsByIp.mockReset().mockResolvedValue(0);
  expirePending.mockReset();
  insertCode.mockReset().mockResolvedValue({ id: "v1" });
  findLiveCode.mockReset();
  bumpAttempts.mockReset().mockResolvedValue(1);
  expireById.mockReset();
  markVerified.mockReset();
  findVerified.mockReset();
  consume.mockReset();
  deleteById.mockReset();
  sendVerification.mockReset().mockResolvedValue(undefined);
  readRequestContext.mockReset().mockResolvedValue({ ip: null, userAgent: null });
});

describe("requestCode()", () => {
  it("이메일은 소문자로, 전화번호는 하이픈 표기로 통일해 다룬다", async () => {
    await requestCode("EMAIL", "  Hong@GBSW.hs.kr ");
    expect(insertCode.mock.calls[0]![0].target).toBe("hong@gbsw.hs.kr");

    await requestCode("PHONE", "01012345678");
    expect(insertCode.mock.calls[1]![0].target).toBe("010-1234-5678");
  });

  it("코드 원본을 저장하지 않는다", async () => {
    await requestCode("EMAIL", "a@b.kr");

    const saved = insertCode.mock.calls[0]![0];
    const sent = sendVerification.mock.calls[0]![0];
    expect(sent.code).toMatch(/^\d{6}$/);
    expect(saved.codeHash).toBe(hash(sent.code));
    expect(saved.codeHash).not.toContain(sent.code);
  });

  it("이전 코드를 먼저 만료시킨다 — 마지막 것만 살아 있어야 한다", async () => {
    await requestCode("EMAIL", "a@b.kr");
    expect(expirePending).toHaveBeenCalled();
  });

  it("형식이 틀리면 보내지 않는다", async () => {
    await expect(requestCode("PHONE", "1234")).rejects.toThrow();
    expect(sendVerification).not.toHaveBeenCalled();
  });

  it("발송이 실패하면 코드를 지워 한도를 갉아먹지 않는다", async () => {
    sendVerification.mockRejectedValue(new Error("알리고 인증오류-IP"));

    await expect(requestCode("EMAIL", "a@b.kr")).rejects.toThrow(
      "인증번호를 보내지 못했습니다",
    );

    expect(deleteById).toHaveBeenCalledWith("v1");
  });

  it("공급자 오류 원문을 사용자에게 그대로 내보내지 않는다", async () => {
    sendVerification.mockRejectedValue(
      new Error("알리고 발송 실패 (result_code=-101, message=인증오류입니다.-IP)"),
    );

    // 키·IP 같은 인프라 정보가 화면으로 새면 안 된다.
    await expect(requestCode("EMAIL", "a@b.kr")).rejects.not.toThrow("-101");
  });

  it("같은 대상에 너무 자주 보내면 막는다", async () => {
    countRecentSends.mockResolvedValue(5);

    await expect(requestCode("EMAIL", "a@b.kr")).rejects.toThrow("너무 많이");
    expect(sendVerification).not.toHaveBeenCalled();
  });

  describe("IP별 제한 (I4)", () => {
    it("같은 접속 IP에서 너무 자주 보내면 막는다 — 대상만 바꿔가며 도는 공격 방어", async () => {
      readRequestContext.mockResolvedValue({ ip: "203.0.113.9", userAgent: null });
      countRecentSendsByIp.mockResolvedValue(20);

      await expect(requestCode("EMAIL", "a@b.kr")).rejects.toThrow("너무 많이");
      expect(sendVerification).not.toHaveBeenCalled();
    });

    it("IP를 못 읽으면(null) IP별 검사를 건너뛴다 — 서로 다른 요청이 한도를 나눠 갖지 않게", async () => {
      readRequestContext.mockResolvedValue({ ip: null, userAgent: null });

      await requestCode("EMAIL", "a@b.kr");

      expect(countRecentSendsByIp).not.toHaveBeenCalled();
      expect(sendVerification).toHaveBeenCalled();
    });

    it("발송한 코드 행에 요청 IP를 함께 남긴다", async () => {
      readRequestContext.mockResolvedValue({ ip: "203.0.113.9", userAgent: null });

      await requestCode("EMAIL", "a@b.kr");

      expect(insertCode.mock.calls[0]![0].requestIp).toBe("203.0.113.9");
    });

    it("한도 아래면 다른 IP는 서로의 발송을 막지 않는다", async () => {
      readRequestContext.mockResolvedValue({ ip: "203.0.113.9", userAgent: null });
      countRecentSendsByIp.mockResolvedValue(3);

      await expect(requestCode("EMAIL", "a@b.kr")).resolves.toBeDefined();
      expect(sendVerification).toHaveBeenCalled();
    });
  });
});

describe("confirmCode()", () => {
  it("맞으면 확인 처리한다", async () => {
    findLiveCode.mockResolvedValue({ id: "v1", codeHash: hash("123456") });

    await confirmCode("EMAIL", "a@b.kr", "123456");

    expect(markVerified).toHaveBeenCalledWith("v1", expect.any(Date));
  });

  it("틀리면 실패 횟수를 올린다", async () => {
    findLiveCode.mockResolvedValue({ id: "v1", codeHash: hash("123456") });

    await expect(confirmCode("EMAIL", "a@b.kr", "000000")).rejects.toThrow(
      "올바르지 않습니다",
    );
    expect(bumpAttempts).toHaveBeenCalledWith("v1");
    expect(markVerified).not.toHaveBeenCalled();
  });

  it("여러 번 틀리면 코드를 만료시킨다", async () => {
    findLiveCode.mockResolvedValue({ id: "v1", codeHash: hash("123456") });
    bumpAttempts.mockResolvedValue(5);

    await expect(confirmCode("EMAIL", "a@b.kr", "000000")).rejects.toThrow(
      "여러 번",
    );
    expect(expireById).toHaveBeenCalledWith("v1", expect.any(Date));
  });

  it("살아 있는 코드가 없으면 거부한다", async () => {
    findLiveCode.mockResolvedValue(null);

    await expect(confirmCode("EMAIL", "a@b.kr", "123456")).rejects.toThrow(
      "만료",
    );
  });
});

describe("requireVerified()", () => {
  it("확인이 끝난 기록이 없으면 가입을 막는다", async () => {
    findVerified.mockResolvedValue(null);

    await expect(requireVerified("PHONE", "010-1234-5678")).rejects.toThrow(
      "휴대폰 인증",
    );
  });

  it("다른 값으로 인증해 두고 다른 값으로 가입할 수 없다", async () => {
    findVerified.mockResolvedValue(null);

    await expect(requireVerified("EMAIL", "other@b.kr")).rejects.toThrow();
    // 조회 대상이 입력값 그대로여야 한다.
    expect(findVerified.mock.calls[0]![1]).toBe("other@b.kr");
  });

  it("확인된 기록이 있으면 통과시킨다", async () => {
    findVerified.mockResolvedValue({ id: "v1" });

    await expect(requireVerified("EMAIL", "a@b.kr")).resolves.toEqual({
      id: "v1",
    });
  });
});
