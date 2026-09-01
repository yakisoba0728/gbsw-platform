import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { recordAudit } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import { getSessionUser } from "@/core/auth/session";

const handlers = toNextJsHandler(auth);

type AuthRouteContext = { params: Promise<{ all: string[] }> };

const SAFE_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  GET: new Set(["get-session"]),
  POST: new Set(["sign-out"]),
};

/**
 * Better Auth의 raw mutation endpoint를 앱 밖으로 열지 않는다.
 *
 * 이 앱은 세션조회·로그아웃만 Better Auth 라우트로 쓴다. 로그인은 감사로그를
 * 남기는 /login/submit으로, 사용자 수정·비밀번호 변경·admin mutation은 앱 서비스
 * 계층으로만 지나야 업무 규칙이 함께 적용된다.
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

  const { all } = await context.params;
  if (method !== "POST" || all.join("/") !== "sign-out") {
    return handler(request);
  }

  const actor = await getSessionUser();
  const response = await handler(request);
  if (response.ok && actor) {
    try {
      await recordAudit({
        actorUserId: actor.id,
        action: "auth:logout",
        targetType: "User",
        targetId: actor.id,
      });
    } catch (error) {
      // 세션 폐기와 같은 트랜잭션에 묶을 수 없으므로 기록 실패가 로그아웃을 뒤집지 않는다.
      console.error("[auth] 로그아웃 기록을 남기지 못했습니다.", error);
    }
  }
  return response;
}

export async function GET(request: NextRequest, context: AuthRouteContext) {
  return guarded("GET", handlers.GET, request, context);
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  return guarded("POST", handlers.POST, request, context);
}
