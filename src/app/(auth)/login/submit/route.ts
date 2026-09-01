import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import { safeNext } from "@/lib/safe-next";
import {
  LOGIN_EMAIL_HINT_COOKIE,
  type LoginErrorCode,
} from "../login-state";

const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MAX_LENGTH = 128;

/**
 * 로그인 CSRF를 막되, Origin이 `null`인 JS 비활성화 브라우저는
 * Fetch Metadata 또는 Referer로 같은 오리진 제출임을 확인한다.
 */
function candidateRequestOrigins(request: NextRequest): string[] {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol === "https" ? "https:" : request.nextUrl.protocol;
  const hosts = [
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    request.headers.get("host")?.trim(),
  ];
  const origins = new Set<string>();

  for (const host of hosts) {
    if (!host) continue;
    try {
      origins.add(new URL(`${protocol}//${host}`).origin);
    } catch {
      // 잘못된 프록시 헤더는 후보에서 제외한다.
    }
  }
  origins.add(request.nextUrl.origin);
  return [...origins];
}

function validatedRequestOrigin(request: NextRequest): string | null {
  const expected = candidateRequestOrigins(request);
  const origin = request.headers.get("origin");

  if (origin && origin !== "null") return expected.includes(origin) ? origin : null;
  if (request.headers.get("sec-fetch-site") === "same-origin") {
    return expected[0] ?? null;
  }

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const refererOrigin = new URL(referer).origin;
    return expected.includes(refererOrigin) ? refererOrigin : null;
  } catch {
    return null;
  }
}

export function isSameOriginLoginRequest(request: NextRequest): boolean {
  return validatedRequestOrigin(request) !== null;
}

async function errorCodeForResponse(response: Response): Promise<LoginErrorCode> {
  if (response.status === 429) return "rateLimited";
  if (response.status === 403) {
    try {
      const body = (await response.clone().json()) as { code?: unknown };
      if (body.code === "ACCOUNT_INACTIVE") return "disabled";
    } catch {
      // 인증 서버의 비정형 오류 응답은 일반 서버 오류로 안내한다.
    }
    return "server";
  }
  return "credentials";
}

/**
 * `ab12cd@gbsw.hs.kr` → `ab***@gbsw.hs.kr`.
 *
 * 로그인 기록은 **남의 주소로 시도한 것까지** 남으므로 주소를 그대로 적으면
 * 감사로그가 곧 주소록이 된다. 규칙은 `verification.sender.ts`의 `maskEmail`과
 * 같다 — 그 파일을 가져오면 발송기 체인이 로그인 경로로 딸려 와 여기 따로 둔다.
 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`;
}

/** 로그인한 사용자 id. 인증 서버의 본문 모양이 바뀌어도 기록이 죽지 않게 받아 낸다. */
async function signedInUserId(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { user?: { id?: unknown } };
    return typeof body.user?.id === "string" ? body.user.id : null;
  } catch {
    return null;
  }
}

/**
 * 로그인 성공·실패를 감사로그에 남긴다. IP·UA·모든 업무 동작을 남기는 시스템에서
 * **세션이 생기는 순간만 비어 있었다.**
 *
 * **비밀번호는 어디에도 남기지 않고 이메일은 가려서 남긴다.**
 *
 * **기록 실패는 삼킨다** — 세션을 만드는 쓰기는 Better Auth 안에 있어 이 기록과 같은
 * 트랜잭션에 묶을 방법이 없다. 묶이지 않는 기록을 전파하면 원자성은 하나도 못
 * 얻고 감사로그 한 줄이 못 들어간 날 아무도 로그인하지 못하게 될 뿐이다.
 * (`invite.service.ts`의 `authz:denied` 기록이 같은 이유로 같은 모양이다.)
 */
async function recordLoginAttempt(input: {
  ok: boolean;
  email: string;
  userId?: string | null;
  reason?: LoginErrorCode;
}): Promise<void> {
  try {
    await recordAudit({
      actorUserId: input.userId ?? null,
      action: input.ok ? "auth:login" : "auth:login-failed",
      targetType: "User",
      targetId: input.userId ?? undefined,
      metadata: input.reason
        ? { email: maskEmail(input.email), reason: input.reason }
        : { email: maskEmail(input.email) },
    });
  } catch (error) {
    console.error("[auth] 로그인 기록을 남기지 못했습니다.", error);
  }
}

function copySetCookies(from: Response, to: NextResponse): void {
  for (const value of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", value);
  }
}

function wantsJson(request: NextRequest): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function failureResponse(
  request: NextRequest,
  code: LoginErrorCode,
  email: string,
  destination: string | null,
  origin: string,
  status = 401,
): NextResponse {
  if (wantsJson(request)) return NextResponse.json({ error: code }, { status });

  const location = new URL("/login", origin);
  location.searchParams.set("loginError", code);
  if (destination) location.searchParams.set("next", destination);

  const response = NextResponse.redirect(location, 303);
  response.cookies.set(LOGIN_EMAIL_HINT_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/login",
    maxAge: 60,
  });
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = validatedRequestOrigin(request);
  if (!origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const destination = safeNext(formData.get("next"));

  if (
    !email ||
    !password ||
    email.length > EMAIL_MAX_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return failureResponse(
      request,
      "invalid",
      email.slice(0, EMAIL_MAX_LENGTH),
      destination,
      origin,
      400,
    );
  }

  // 이미 위에서 같은 오리진 폼임을 확인했다. Better Auth 내부 요청에도 명시적인
  // 오리진을 전달해 `Origin: null` 브라우저의 폴백을 안전하게 수용한다.
  const authHeaders = new Headers(request.headers);
  authHeaders.set("content-type", "application/json");
  authHeaders.set("accept", "application/json");
  authHeaders.set("origin", origin);
  authHeaders.delete("content-length");

  const authResponse = await auth.handler(
    new Request(new URL("/api/auth/sign-in/email", origin), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email, password }),
    }),
  );

  if (!authResponse.ok) {
    const code = await errorCodeForResponse(authResponse);
    await recordLoginAttempt({ ok: false, email, reason: code });

    return failureResponse(
      request,
      code,
      email,
      destination,
      origin,
      authResponse.status,
    );
  }

  await recordLoginAttempt({
    ok: true,
    email,
    userId: await signedInUserId(authResponse),
  });

  const response = wantsJson(request)
    ? NextResponse.json({ redirectTo: destination ?? "/" })
    : NextResponse.redirect(new URL(destination ?? "/", origin), 303);
  response.cookies.set(LOGIN_EMAIL_HINT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/login",
    maxAge: 0,
  });
  copySetCookies(authResponse, response);
  return response;
}
