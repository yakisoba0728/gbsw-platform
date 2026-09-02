import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/core/auth/auth";
import { signOut } from "@/modules/auth/auth.service";

const handlers = toNextJsHandler(auth);

type AuthRouteContext = { params: Promise<{ all: string[] }> };

// 인증 변경은 감사·도메인 검증을 거치는 자체 서비스로만 허용한다.
const SAFE_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  GET: new Set(["get-session"]),
  POST: new Set(["sign-out"]),
};

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

  const { all } = await context.params;
  if (method !== "POST" || all.join("/") !== "sign-out") {
    return handler(request);
  }

  return signOut(request);
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
  return guarded("GET", handlers.GET, request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  return guarded("POST", handlers.POST, request, context);
}
