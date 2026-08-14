import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/core/auth/auth";

const handlers = toNextJsHandler(auth);

type RouteContext = { params: Promise<{ all: string[] }> };

/**
 * /api/auth/admin/* 는 통째로 막는다.
 *
 * 앱은 이 15개 엔드포인트를 하나도 안 쓴다 — 브라우저는 sign-in/email·sign-out·세션
 * 조회만 부르고, changePassword·signInEmail 같은 서버 쪽 호출도 auth.api.*를 직접 불러
 * HTTP를 타지 않는다. 반면 이 경로들은 recordAudit을 지나지 않아 흔적이 안 남고,
 * set-role·remove-user·impersonate-user는 확인 절차 없이 열려 있었다.
 * 플러그인 자체(role·banned 컬럼 관리)는 그대로 둔다 — HTTP 표면만 닫는다.
 *
 * params는 Next가 이미 퍼센트 인코딩을 풀어서 넘겨준다 — raw pathname을
 * startsWith로 비교하면 /api/auth/%61dmin/... 같은 우회가 가능하다.
 */
async function isBlockedAdminPath(context: RouteContext): Promise<boolean> {
  const { all } = await context.params;
  return all?.[0] === "admin";
}

async function guarded(
  handler: (request: Request) => Promise<Response>,
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  if (await isBlockedAdminPath(context)) {
    return new NextResponse(null, { status: 404 });
  }
  return handler(request);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return guarded(handlers.GET, request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return guarded(handlers.POST, request, context);
}
