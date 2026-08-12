import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL 환경변수가 없습니다. .env.example을 .env로 복사했는지 확인하세요.",
  );
}

// Prisma 7은 드라이버 어댑터로만 SQL에 접속한다 (네이티브 엔진 바이너리 없음).
const adapter = new PrismaPg({ connectionString });

// next dev의 핫 리로드마다 커넥션 풀이 새로 생기지 않도록 개발 환경에서는
// globalThis에 붙여 재사용한다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
