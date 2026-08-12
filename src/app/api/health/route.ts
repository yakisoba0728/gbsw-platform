import { prisma } from "@/core/db/client";

// 컨테이너 헬스체크용. 캐시되면 의미가 없으므로 항상 새로 실행한다.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
