import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/core/auth/auth";

const handlers = toNextJsHandler(auth);

type AuthRouteContext = { params: Promise<{ all: string[] }> };

const SAFE_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  GET: new Set(["get-session"]),
  POST: new Set(["get-session", "sign-in/email", "sign-out"]),
};

/**
 * Better Auth의 raw mutation endpoint를 앱 밖으로 열지 않는다.
 *
 * 이 앱은 로그인·세션조회·로그아웃만 Better Auth 라우트로 쓴다. 사용자 수정,
 * 비밀번호 변경, admin mutation은 반드시 앱 서비스 계층을 지나야 감사로그와
 * 업무 규칙이 함께 적용된다.
 */
export async function isAllowedAuthEndpoint(
  method: "GET" | "POST",
  context: AuthRouteContext,
): Promise<boolean> {
  const { all } = await context.params;
  const endpoint = all.join("/");
  return SAFE_ENDPOINTS[method]?.has(endpoint) ?? false;
}

async function guarded(
  method: "GET" | "POST",
  handler: (request: Request) => Promise<Response>,
  request: NextRequest,
  context: AuthRouteContext,
): Promise<Response> {
  if (!(await isAllowedAuthEndpoint(method, context))) {
    return new NextResponse(null, { status: 404 });
  }
  return handler(request);
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
  return guarded("GET", handlers.GET, request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  return guarded("POST", handlers.POST, request, context);
}
