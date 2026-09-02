import { prisma } from "@/core/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 인프라 생존 확인만 하므로 도메인 서비스 없이 DB 연결을 검사한다.
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
