import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { PassError } from "@/modules/pass/pass.error";
import { getPassQr } from "@/modules/pass/request.service";

/**
 * 20초마다 새 QR. 서버 액션이 아니라 라우트 핸들러인 이유는 이것이 **읽기**라서다 —
 * 서버 액션은 POST에 revalidation 부수효과가 붙어 화면 전체를 다시 그린다.
 *
 * requireAuth()를 쓰지 않는다. 그쪽은 미로그인을 /login으로 redirect하는데,
 * fetch를 받는 자리에서는 307 대신 401이 맞다.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ passId: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const { passId } = await params;

  try {
    return json(await getPassQr(user, passId), 200);
  } catch (error) {
    if (error instanceof ForbiddenError) return json({ error: "FORBIDDEN" }, 403);
    if (error instanceof PassError) return json({ error: error.message }, 404);
    throw error;
  }
}

/** 20초짜리 값이라 어디에도 캐시되면 안 된다 — 프록시·브라우저 둘 다. */
function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}
