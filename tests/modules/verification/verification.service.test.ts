import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const countRecentSends = vi.fn();
const countRecentSendsByIp = vi.fn();
const lockSendRateLimitBuckets = vi.fn();
const lockVerificationTarget = vi.fn();
const expirePending = vi.fn();
const insertCode = vi.fn();
const activateCode = vi.fn();
const hasNewerActivatedCode = vi.fn();
const findLiveCode = vi.fn();
const bumpAttempts = vi.fn();
const expireById = vi.fn();
const markVerified = vi.fn();
const findVerified = vi.fn();
const consume = vi.fn();
const deleteById = vi.fn();
const sendVerification = vi.fn();
const readRequestContext = vi.fn();
const {
  txClient,
  bareWithTransaction: withTransaction,
} = coreMocks("verification-service-test");

vi.mock("@/modules/verification/verification.repo", () => ({
  countRecentSends,
  countRecentSendsByIp,
  lockSendRateLimitBuckets,
  lockVerificationTarget,
  expirePending,
  insertCode,
  activateCode,
  hasNewerActivatedCode,
  findLiveCode,
  bumpAttempts,
  expireById,
  markVerified,
  findVerified,
  consume,
  deleteById,
}));
vi.mock("@/modules/verification/verification.sender", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendVerification,
}));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

const {
  confirmCode,
  consumeVerifications,
  MAX_SENDS_PER_HOUR_PER_IP,
  requestCode,
  requireVerified,
} = await import("@/modules/verification/verification.service");

const { createHash } = await import("node:crypto");
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

beforeEach(() => {
  countRecentSends.mockReset().mockResolvedValue(0);
  countRecentSendsByIp.mockReset().mockResolvedValue(0);
  lockSendRateLimitBuckets.mockReset();
  lockVerificationTarget.mockReset();
  expirePending.mockReset();
  insertCode.mockReset().mockResolvedValue({ id: "v1" });
  activateCode.mockReset();
  hasNewerActivatedCode.mockReset().mockResolvedValue(false);
  findLiveCode.mockReset();
  bumpAttempts.mockReset().mockResolvedValue(1);
  expireById.mockReset();
  markVerified.mockReset();
  findVerified.mockReset();
  consume.mockReset().mockResolvedValue(2);
  deleteById.mockReset();
  sendVerification.mockReset().mockResolvedValue(undefined);
  readRequestContext.mockReset().mockResolvedValue({ ip: null, userAgent: null });
  withTransaction
    .mockReset()
    .mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
      fn(txClient),
    );
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

  it("발송 성공 뒤에만 이전 코드를 만료하고 새 코드를 활성화한다", async () => {
    await requestCode("EMAIL", "a@b.kr");

    expect(expirePending).toHaveBeenCalledWith(
      "EMAIL",
      "a@b.kr",
      expect.any(Date),
      txClient,
    );
    expect(activateCode).toHaveBeenCalledWith(
      "v1",
      expect.any(Date),
      txClient,
    );
    expect(expirePending.mock.invocationCallOrder[0]).toBeGreaterThan(
      sendVerification.mock.invocationCallOrder[0]!,
    );
  });

  it("늦게 끝난 이전 발송이 더 최신 코드를 무효화하지 않는다", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const firstDelivery = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondDelivery = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    insertCode
      .mockResolvedValueOnce({ id: "v-first" })
      .mockResolvedValueOnce({ id: "v-second" });
    sendVerification
      .mockImplementationOnce(() => firstDelivery)
      .mockImplementationOnce(() => secondDelivery);
    hasNewerActivatedCode.mockImplementation(
      async (_channel, _target, id) => id === "v-first",
    );

    const first = requestCode("EMAIL", "a@b.kr");
    const second = requestCode("EMAIL", "a@b.kr");
    await vi.waitFor(() => expect(sendVerification).toHaveBeenCalledTimes(2));

    finishSecond();
    await expect(second).resolves.toEqual({});
    finishFirst();
    await expect(first).rejects.toThrow("더 최근에 요청한 인증번호");

    expect(activateCode).toHaveBeenCalledTimes(1);
    expect(activateCode).toHaveBeenCalledWith(
      "v-second",
      expect.any(Date),
      txClient,
    );
    expect(deleteById).not.toHaveBeenCalledWith("v-first");
  });

  it("더 최신 요청이 아직 발송 중이면 먼저 성공한 코드를 임시로 활성화한다", async () => {
    insertCode.mockResolvedValue({ id: "v-first" });
    hasNewerActivatedCode.mockResolvedValue(false);

    await expect(requestCode("EMAIL", "a@b.kr")).resolves.toEqual({});

    expect(activateCode).toHaveBeenCalledWith(
      "v-first",
      expect.any(Date),
      txClient,
    );
  });

  it("세 요청이 겹쳐도 가장 최근에 성공한 발송을 더 오래된 발송이 덮지 않는다", async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    let failThird!: () => void;
    const firstDelivery = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondDelivery = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const thirdDelivery = new Promise<void>((_resolve, reject) => {
      failThird = () => reject(new Error("provider unavailable"));
    });
    insertCode
      .mockResolvedValueOnce({ id: "v-first" })
      .mockResolvedValueOnce({ id: "v-second" })
      .mockResolvedValueOnce({ id: "v-third" });
    sendVerification
      .mockImplementationOnce(() => firstDelivery)
      .mockImplementationOnce(() => secondDelivery)
      .mockImplementationOnce(() => thirdDelivery);
    hasNewerActivatedCode.mockImplementation(
      async (_channel, _target, id) => id === "v-first",
    );

    const first = requestCode("EMAIL", "a@b.kr");
    const second = requestCode("EMAIL", "a@b.kr");
    const third = requestCode("EMAIL", "a@b.kr");
    const thirdResult = third.catch((error: unknown) => error);
    await vi.waitFor(() => expect(sendVerification).toHaveBeenCalledTimes(3));

    finishSecond();
    await expect(second).resolves.toEqual({});
    finishFirst();
    await expect(first).rejects.toThrow("더 최근에 요청한 인증번호");
    failThird();
    await expect(thirdResult).resolves.toBeInstanceOf(Error);

    expect(activateCode.mock.calls.map((call) => call[0])).toEqual([
      "v-second",
    ]);
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
    expect(expirePending).not.toHaveBeenCalled();
    expect(activateCode).not.toHaveBeenCalled();
  });

  it("공급자 오류 원문을 사용자에게 그대로 내보내지 않는다", async () => {
    sendVerification.mockRejectedValue(
      new Error("알리고 발송 실패 (result_code=-101, message=인증오류입니다.-IP)"),
    );

    await expect(requestCode("EMAIL", "a@b.kr")).rejects.not.toThrow("-101");
  });

  it("공급자 오류 객체의 이메일과 인증번호를 로그에 남기지 않는다", async () => {
    const target = "private.student@example.com";
    let sentCode = "";
    sendVerification.mockImplementationOnce(async (input) => {
      sentCode = input.code;
      throw Object.assign(
        new Error(`rejected ${input.target} with ${input.code}`),
        {
          code: "EENVELOPE",
          recipient: input.target,
          rejected: [input.target],
        },
      );
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(requestCode("EMAIL", target)).rejects.toThrow(
        "인증번호를 보내지 못했습니다",
      );

      const logged = errorSpy.mock.calls
        .map((call) => call.map((value) => JSON.stringify(value)).join(" "))
        .join(" ");
      expect(logged).toContain("pr***@example.com");
      expect(logged).toContain("EENVELOPE");
      expect(logged).not.toContain(target);
      expect(logged).not.toContain(sentCode);
      expect(logged).not.toContain("recipient");
      expect(logged).not.toContain("rejected");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("같은 대상에 너무 자주 보내면 막는다", async () => {
    countRecentSends.mockResolvedValue(5);

    await expect(requestCode("EMAIL", "a@b.kr")).rejects.toThrow("너무 많이");
    expect(sendVerification).not.toHaveBeenCalled();
  });

  describe("IP별 제한 (I4)", () => {
    it("같은 접속 IP에서 너무 자주 보내면 막는다 — 대상만 바꿔가며 도는 공격 방어", async () => {
      readRequestContext.mockResolvedValue({ ip: "203.0.113.9", userAgent: null });
      countRecentSendsByIp.mockResolvedValue(MAX_SENDS_PER_HOUR_PER_IP);

      await expect(requestCode("EMAIL", "a@b.kr")).rejects.toThrow("너무 많이");
      expect(sendVerification).not.toHaveBeenCalled();
    });

    it("IP를 못 읽으면 IP별 검사를 건너뛴다", async () => {
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

    expect(lockVerificationTarget).toHaveBeenCalledWith(
      "EMAIL",
      "a@b.kr",
      txClient,
    );
    expect(markVerified).toHaveBeenCalledWith("v1", expect.any(Date), txClient);
  });

  it("틀리면 실패 횟수를 올린다", async () => {
    findLiveCode.mockResolvedValue({ id: "v1", codeHash: hash("123456") });

    await expect(confirmCode("EMAIL", "a@b.kr", "000000")).rejects.toThrow(
      "인증번호가 맞지 않습니다.",
    );
    expect(bumpAttempts).toHaveBeenCalledWith("v1", txClient);
    expect(markVerified).not.toHaveBeenCalled();
  });

  it("여러 번 틀리면 코드를 만료시킨다", async () => {
    findLiveCode.mockResolvedValue({ id: "v1", codeHash: hash("123456") });
    bumpAttempts.mockResolvedValue(5);

    await expect(confirmCode("EMAIL", "a@b.kr", "000000")).rejects.toThrow(
      "여러 번",
    );
    expect(expireById).toHaveBeenCalledWith("v1", expect.any(Date), txClient);
  });

  it("살아 있는 코드가 없으면 거부한다", async () => {
    findLiveCode.mockResolvedValue(null);

    await expect(confirmCode("EMAIL", "a@b.kr", "123456")).rejects.toThrow(
      "만료",
    );
  });

  it("잠금을 기다린 뒤의 시각으로 만료 여부를 다시 판정한다", async () => {
    const beforeLock = new Date("2026-09-02T10:00:00.000Z");
    const afterLock = new Date("2026-09-02T10:00:05.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(beforeLock);
    lockVerificationTarget.mockImplementationOnce(async () => {
      vi.setSystemTime(afterLock);
    });
    findLiveCode.mockResolvedValue(null);

    try {
      await expect(confirmCode("EMAIL", "a@b.kr", "123456")).rejects.toThrow(
        "만료",
      );
      expect(findLiveCode.mock.calls[0]![2]).toEqual(afterLock);
    } finally {
      vi.useRealTimers();
    }
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
    expect(findVerified.mock.calls[0]![1]).toBe("other@b.kr");
  });

  it("확인된 기록이 있으면 통과시킨다", async () => {
    findVerified.mockResolvedValue({ id: "v1" });

    await expect(requireVerified("EMAIL", "a@b.kr")).resolves.toEqual({
      id: "v1",
    });
  });
});

describe("consumeVerifications()", () => {
  it("가입 트랜잭션의 DB 클라이언트로 인증코드를 소진한다", async () => {
    const tx = { tx: true };

    await consumeVerifications(["v1", "v2"], tx as never);

    expect(consume).toHaveBeenCalledWith(["v1", "v2"], expect.any(Date), tx);
  });

  it("이미 소진된 proof가 섞이면 가입 트랜잭션을 실패시킨다", async () => {
    consume.mockResolvedValueOnce(1);

    await expect(consumeVerifications(["v1", "v2"], {} as never)).rejects.toThrow(
      "인증 확인이 만료되었습니다",
    );
  });

  it("같은 proof id가 중복으로 들어와도 한 번만 소진한다", async () => {
    consume.mockResolvedValueOnce(1);

    await consumeVerifications(["v1", "v1"], {} as never);

    expect(consume).toHaveBeenCalledWith(["v1"], expect.any(Date), expect.anything());
  });
});
