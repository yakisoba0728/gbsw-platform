import { NextResponse, type NextRequest } from "next/server";
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
    return failureResponse(
      request,
      await errorCodeForResponse(authResponse),
      email,
      destination,
      origin,
      authResponse.status,
    );
  }

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
