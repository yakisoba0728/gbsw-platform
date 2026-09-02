import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const signInEmail = vi.fn();
const authHandler = vi.fn();
const getSessionUser = vi.fn();
const recordAudit = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/core/auth/auth", () => ({
  auth: { api: { signInEmail }, handler: authHandler },
}));
vi.mock("@/core/auth/session", () => ({ getSessionUser }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { authenticateWithEmail, signInSilently, signOut } = await import(
  "@/modules/auth/auth.service"
);

const requestHeaders = new Headers({ origin: "https://example.test" });

beforeEach(() => {
  signInEmail.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  authHandler.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  getSessionUser.mockReset().mockResolvedValue({ id: "user-1" });
  recordAudit.mockReset();
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe("authenticateWithEmail()", () => {
  it("Better Auth 성공 응답과 사용자 감사를 함께 돌려준다", async () => {
    const response = new Response(JSON.stringify({ user: { id: "user-login" } }), {
      status: 200,
      headers: { "set-cookie": "session=value" },
    });
    authHandler.mockResolvedValueOnce(response);

    const result = await authenticateWithEmail({
      email: "tester@gbsw.hs.kr",
      password: "password",
      origin: "https://example.test",
      requestHeaders,
    });

    expect(result).toEqual({ ok: true, response });
    const authRequest = authHandler.mock.calls[0]?.[0] as Request;
    expect(authRequest.url).toBe("https://example.test/api/auth/sign-in/email");
    expect(authRequest.headers.get("origin")).toBe("https://example.test");
    await expect(authRequest.json()).resolves.toEqual({
      email: "tester@gbsw.hs.kr",
      password: "password",
    });
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "user-login",
      action: "auth:login",
      targetType: "User",
      targetId: "user-login",
      metadata: { email: "te***@gbsw.hs.kr" },
    });
  });

  it("Better Auth 실패를 화면용 코드로 바꾸고 같은 시도에 감사한다", async () => {
    const response = new Response(JSON.stringify({ code: "ACCOUNT_INACTIVE" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    authHandler.mockResolvedValueOnce(response);

    const result = await authenticateWithEmail({
      email: "tester@gbsw.hs.kr",
      password: "password",
      origin: "https://example.test",
      requestHeaders,
    });

    expect(result).toEqual({ ok: false, reason: "disabled", response });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        action: "auth:login-failed",
        metadata: { email: "te***@gbsw.hs.kr", reason: "disabled" },
      }),
    );
  });

  it.each([
    [401, undefined, "credentials"],
    [429, undefined, "rateLimited"],
    [403, { code: "INVALID_ORIGIN" }, "server"],
  ] as const)("HTTP %i 실패를 %s 코드로 바꾼다", async (status, body, reason) => {
    authHandler.mockResolvedValueOnce(
      new Response(body ? JSON.stringify(body) : null, {
        status,
        headers: body ? { "content-type": "application/json" } : undefined,
      }),
    );

    const result = await authenticateWithEmail({
      email: "tester@gbsw.hs.kr",
      password: "password",
      origin: "https://example.test",
      requestHeaders,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("이메일 모양이 아니면 실패 감사에서 주소를 통째로 가린다", async () => {
    authHandler.mockResolvedValueOnce(new Response(null, { status: 401 }));

    await authenticateWithEmail({
      email: "not-an-email",
      password: "password",
      origin: "https://example.test",
      requestHeaders,
    });

    expect(recordAudit.mock.calls[0]?.[0].metadata).toEqual({
      email: "***",
      reason: "credentials",
    });
  });

  it("감사 실패를 로그인 응답으로 전파하지 않는다", async () => {
    const error = new Error("audit unavailable");
    const response = new Response(JSON.stringify({ user: { id: "user-login" } }));
    authHandler.mockResolvedValueOnce(response);
    recordAudit.mockRejectedValueOnce(error);

    await expect(
      authenticateWithEmail({
        email: "tester@gbsw.hs.kr",
        password: "password",
        origin: "https://example.test",
        requestHeaders,
      }),
    ).resolves.toEqual({ ok: true, response });
    expect(consoleError).toHaveBeenCalledWith(
      "[auth] 로그인 기록을 남기지 못했습니다.",
      error,
    );
  });
});

describe("signInSilently()", () => {
  it("발급된 사용자로 로그인 감사를 남긴다", async () => {
    await signInSilently(
      "ab12cd@gbsw.hs.kr",
      "password",
      Promise.resolve(requestHeaders),
    );

    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: "ab12cd@gbsw.hs.kr", password: "password" },
      headers: requestHeaders,
    });
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "user-1",
      action: "auth:login",
      targetType: "User",
      targetId: "user-1",
      metadata: { email: "ab***@gbsw.hs.kr" },
    });
  });

  it("세션 발급 실패는 가입 성공을 뒤집지 않는다", async () => {
    signInEmail.mockRejectedValueOnce(new Error("session failed"));

    await expect(
      signInSilently("user@gbsw.hs.kr", "password", Promise.resolve(requestHeaders)),
    ).resolves.toBeUndefined();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("감사 실패도 가입 성공을 뒤집지 않고 서버에 남긴다", async () => {
    const error = new Error("audit unavailable");
    recordAudit.mockRejectedValueOnce(error);

    await expect(
      signInSilently("user@gbsw.hs.kr", "password", Promise.resolve(requestHeaders)),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "[auth] 자동 로그인 기록을 남기지 못했습니다.",
      error,
    );
  });

  it("요청 헤더를 읽지 못해도 가입 성공을 뒤집지 않는다", async () => {
    await expect(
      signInSilently(
        "user@gbsw.hs.kr",
        "password",
        Promise.reject(new Error("request context unavailable")),
      ),
    ).resolves.toBeUndefined();
    expect(signInEmail).not.toHaveBeenCalled();
  });
});

describe("signOut()", () => {
  it("세션이 사라지기 전에 사용자를 읽고 성공한 로그아웃을 기록한다", async () => {
    const request = new Request("https://example.test/api/auth/sign-out", {
      method: "POST",
    });

    const response = await signOut(request);

    expect(response.status).toBe(204);
    expect(getSessionUser.mock.invocationCallOrder[0]).toBeLessThan(
      authHandler.mock.invocationCallOrder[0]!,
    );
    expect(authHandler).toHaveBeenCalledWith(request);
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "user-1",
      action: "auth:logout",
      targetType: "User",
      targetId: "user-1",
    });
  });

  it("Better Auth의 원래 응답을 그대로 돌려준다", async () => {
    const response = new Response("signed out", {
      headers: { "set-cookie": "session=; Max-Age=0" },
    });
    authHandler.mockResolvedValueOnce(response);

    await expect(signOut(new Request("https://example.test"))).resolves.toBe(response);
  });

  it("세션 폐기가 실패하면 기록하지 않는다", async () => {
    authHandler.mockResolvedValueOnce(new Response("failed", { status: 500 }));

    const response = await signOut(new Request("https://example.test"));

    expect(response.status).toBe(500);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("사용자를 읽지 못하면 성공 응답이어도 기록하지 않는다", async () => {
    getSessionUser.mockResolvedValueOnce(null);
    const request = new Request("https://example.test/api/auth/sign-out");

    await signOut(request);

    expect(authHandler).toHaveBeenCalledWith(request);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("세션 폐기 예외는 그대로 전파하고 기록하지 않는다", async () => {
    authHandler.mockRejectedValueOnce(new Error("sign-out failed"));

    await expect(signOut(new Request("https://example.test"))).rejects.toThrow(
      "sign-out failed",
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("감사 실패를 로그아웃 응답으로 전파하지 않는다", async () => {
    const error = new Error("audit unavailable");
    const response = new Response("signed out");
    authHandler.mockResolvedValueOnce(response);
    recordAudit.mockRejectedValueOnce(error);

    await expect(signOut(new Request("https://example.test"))).resolves.toBe(response);
    expect(consoleError).toHaveBeenCalledWith(
      "[auth] 로그아웃 기록을 남기지 못했습니다.",
      error,
    );
  });
});
