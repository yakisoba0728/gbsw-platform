import { prisma } from "./client";

/* 앱 계층이 prisma 클라이언트를 직접 만지지 않고 DB 생존을 확인할 때 쓴다.
   (헬스체크 등 인프라 확인 전용 — 도메인 쿼리는 각 모듈의 repo를 거친다.) */
export async function ping(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
