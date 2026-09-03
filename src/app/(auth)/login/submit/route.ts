import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { authenticateWithEmail } from "@/modules/auth/auth.service";
import {
  LOGIN_EMAIL_HINT_COOKIE,
  type LoginErrorCode,
} from "../login-state";

const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MAX_LENGTH = 128;

// 공개 주소의 유일한 출처는 BETTER_AUTH_URL이다. 앱은 127.0.0.1에만 묶여 있어
// 요청 헤더로는 공개 주소를 알 수 없고(학생증 QR도 같은 이유로 이 값을 쓴다),
// x-forwarded-host·host에서 유도하면 프록시가 헤더를 덮어쓰지 않거나 원본 포트에
// 직접 닿는 순간 공격자가 오리진 검사를 스스로 통과시킨다.
function configuredOrigin(): string | null {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// 허용 오리진은 요청이 아니라 설정이 정하는 고정 목록이다.
function allowedOrigins(request: NextRequest): string[] {
  const origins = new Set<string>();
  const configured = configuredOrigin();
  if (configured) origins.add(configured);

  // 개발에서는 teacher.localhost·student.localhost처럼 하위 도메인을 나눠 세 역할을
  // 동시에 띄운다. BETTER_AUTH_URL 하나로 좁히면 그 방식이 전부 막히므로 요청 자신의
  // 오리진도 허용한다 — 이 값은 결국 Host 헤더에서 나오므로 **운영에서는 쓰지 않는다.**
  // NODE_ENV 리터럴을 여기서 직접 읽어 운영 번들에서는 이 가지가 통째로 지워진다.
  if (process.env.NODE_ENV !== "production") {
    origins.add(request.nextUrl.origin);
  }

  // BETTER_AUTH_URL이 없거나 파싱되지 않으면 목록이 비어 로그인이 전부 403이 된다.
  // compose가 이 값을 필수로 요구하므로(:?) 운영에서는 생기지 않는 상태이고, 모르는
  // 공개 주소를 헤더로 메우는 것이 곧 여기서 없앤 결함이다.
  return [...origins];
}

// Origin이 null인 JS 비활성 브라우저도 같은 오리진임을 별도 확인해야 한다.
function validatedRequestOrigin(request: NextRequest): string | null {
  const allowed = allowedOrigins(request);
  const origin = request.headers.get("origin");

  if (origin && origin !== "null") return allowed.includes(origin) ? origin : null;
  if (request.headers.get("sec-fetch-site") === "same-origin") {
    // 요청이 스스로 말하는 오리진은 허용 목록에 있을 때만 쓴다 — 개발의 하위 도메인이
    // 자기 주소로 돌아가고, 운영에서는 위조 Host가 목록에 없어 공개 오리진으로 떨어진다.
    const own = request.nextUrl.origin;
    return allowed.includes(own) ? own : (allowed[0] ?? null);
  }

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const refererOrigin = new URL(referer).origin;
    return allowed.includes(refererOrigin) ? refererOrigin : null;
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
