import { NextResponse } from "next/server";
import { getSessionUser } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { getMyStudentQr } from "@/modules/pass/request.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.status !== "ACTIVE" || user.deletedAt || user.mustChangePassword) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    return json(await getMyStudentQr(user), 200);
  } catch (error) {
    if (error instanceof ForbiddenError) return json({ error: "FORBIDDEN" }, 403);
    throw error;
  }
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}
