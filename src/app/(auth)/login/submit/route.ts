import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { authenticateWithEmail } from "@/modules/auth/auth.service";
import {
  LOGIN_EMAIL_HINT_COOKIE,
  type LoginErrorCode,
} from "../login-state";

const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MAX_LENGTH = 128;

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

// Origin이 null인 JS 비활성 브라우저도 같은 오리진임을 별도 확인해야 한다.
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
  // JS 없는 재시도에도 이메일을 URL에 노출하지 않는다.
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

  const authentication = await authenticateWithEmail({
    email,
    password,
    origin,
    requestHeaders: request.headers,
  });

  if (!authentication.ok) {
    return failureResponse(
      request,
      authentication.reason,
      email,
      destination,
      origin,
      authentication.response.status,
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
  copySetCookies(authentication.response, response);
  return response;
}
