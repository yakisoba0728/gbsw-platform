import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/core/auth/auth";

const handlers = toNextJsHandler(auth);

type RouteContext = { params: Promise<{ all: string[] }> };

/**
 * `/api/auth/admin/*`를 통째로 막는다 — 앱이 쓰지 않는데다 recordAudit을 지나지
 * 않아 set-role·remove-user가 흔적 없이 열려 있다. 플러그인 자체는 그대로 둔다.
 *
 * raw pathname이 아니라 params를 쓴다 — Next가 퍼센트 인코딩을 이미 풀어서 준다
 * (`/api/auth/%61dmin/...` 우회를 막는다).
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
