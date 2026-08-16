import { prisma } from "@/core/db/client";

/*
 * 컨테이너 헬스체크. **이 저장소에서 라우트가 Prisma를 직접 부르는 유일한 곳이고,
 * 3계층 규칙(Route → Service → Repo)의 의도된 예외다** — bootstrap 모듈을 예외로
 * 적어 둔 것과 같은 방식으로 여기 근거를 남긴다.
 *
 * 근거: 이건 업무가 아니라 인프라 점검이다. 확인하려는 대상이 "이 프로세스가
 * DB에 실제로 연결되어 있는가" 자체라, 서비스·repo를 한 겹 끼우면 점검 대상과
 * 점검 경로가 어긋난다(모듈 하나가 목이거나 캐시를 물면 죽은 DB에도 200이 뜬다).
 * 도메인 데이터를 읽지도 쓰지도 않으므로 권한·감사로그도 성립하지 않는다.
 * **다른 라우트가 이 예외를 따라하면 안 된다.**
 */

// 캐시되면 의미가 없으므로 항상 새로 실행한다.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
