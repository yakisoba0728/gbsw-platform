import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWithEmail = vi.fn();

vi.mock("@/modules/auth/auth.service", () => ({ authenticateWithEmail }));

const { POST } = await import(
  "@/app/(auth)/login/submit/route"
);

function loginRequest({
  accept = "application/json",
  email = "tester@gbsw.hs.kr",
  host,
  next,
  origin = "http://teacher.localhost:3000",
  password = "test-password-only",
  requestUrl = "http://teacher.localhost:3000/login/submit",
  secFetchSite,
}: {
  accept?: string;
  email?: string;
  host?: string;
  next?: string;
  origin?: string;
  password?: string;
  requestUrl?: string;
  secFetchSite?: string;
} = {}): NextRequest {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  if (next) form.set("next", next);

  const headers = new Headers({ accept, origin });
  if (host) headers.set("host", host);
  if (secFetchSite) headers.set("sec-fetch-site", secFetchSite);

  return new NextRequest(requestUrl, {
    method: "POST",
    headers,
    body: form,
  });
}

beforeEach(() => {
  authenticateWithEmail.mockReset().mockResolvedValue({
    ok: true,
    response: new Response(null, {
      status: 200,
      headers: {
        "set-cookie": "better-auth.session_token=session-value; Path=/; HttpOnly",
      },
    }),
  });
});

function rejectAuthentication(
  reason: "credentials" | "disabled" | "rateLimited" | "server",
  status: number,
): void {
  const response = new Response(null, { status });
  authenticateWithEmail.mockResolvedValueOnce({ ok: false, reason, response });
}

describe("login submit route", () => {
  it("교차 오리진 제출은 인증 전에 거부한다", async () => {
    const request = loginRequest({ origin: "https://attacker.example" });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(authenticateWithEmail).not.toHaveBeenCalled();
  });

  it("Origin null이어도 브라우저가 같은 오리진임을 증명하면 허용한다", async () => {
    const request = loginRequest({ origin: "null", secFetchSite: "same-origin" });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(authenticateWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "http://teacher.localhost:3000" }),
    );
  });

  it("Next 내부 URL과 공개 Host가 달라도 공개 오리진으로 되돌린다", async () => {
    rejectAuthentication("credentials", 401);
    const request = loginRequest({
      accept: "text/html",
      host: "127.0.0.1:3100",
      origin: "null",
      requestUrl: "http://localhost:3100/login/submit",
      secFetchSite: "same-origin",
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toMatch(
      /^http:\/\/127\.0\.0\.1:3100\/login\?/,
    );
    expect(authenticateWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "http://127.0.0.1:3100" }),
    );
  });

  it("JS 로그인 실패는 코드만 응답하고 비밀번호를 남기지 않는다", async () => {
    rejectAuthentication("credentials", 401);

    const response = await POST(loginRequest());
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(body)).toEqual({ error: "credentials" });
    expect(body).not.toContain("test-password-only");
    expect(authenticateWithEmail).toHaveBeenCalledWith({
      email: "tester@gbsw.hs.kr",
      password: "test-password-only",
      origin: "http://teacher.localhost:3000",
      requestHeaders: expect.any(Headers),
    });
  });

  it("비활성 계정 오류만 계정 중지 안내로 구분한다", async () => {
    rejectAuthentication("disabled", 403);

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "disabled" });
  });

  it("오리진 거부 등 다른 403은 계정 중지로 오인하지 않는다", async () => {
    rejectAuthentication("server", 403);

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "server" });
  });

  it("JS 없는 실패는 이메일 힌트만 짧은 HttpOnly 쿠키에 두고 로그인으로 돌려보낸다", async () => {
    rejectAuthentication("credentials", 401);
    const request = loginRequest({
      accept: "text/html",
      origin: "null",
      secFetchSite: "same-origin",
      email: "keep@gbsw.hs.kr",
    });

    const response = await POST(request);
    const location = new URL(response.headers.get("location") ?? "");
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("loginError")).toBe("credentials");
    expect(location.search).not.toContain("keep%40gbsw.hs.kr");
    expect(location.search).not.toContain("test-password-only");
    expect(setCookie).toContain("gbsw.login-email-hint=keep%40gbsw.hs.kr");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=60");
  });

  it("성공하면 세션 쿠키를 복사하고 안전한 next만 반환한다", async () => {
    const response = await POST(loginRequest({ next: "/scan?c=public-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/scan?c=public-token",
    });
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=session-value",
    );
    expect(authenticateWithEmail).toHaveBeenCalledWith({
      email: "tester@gbsw.hs.kr",
      password: "test-password-only",
      origin: "http://teacher.localhost:3000",
      requestHeaders: expect.any(Headers),
    });
  });

  it("외부 next 주소는 폐기한다", async () => {
    const response = await POST(
      loginRequest({ next: "https://attacker.example/steal" }),
    );

    await expect(response.json()).resolves.toEqual({ redirectTo: "/" });
  });
});
