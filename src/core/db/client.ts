import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL 환경변수가 없습니다. .env.example을 .env로 복사했는지 확인하세요.",
  );
}

// Prisma 7은 드라이버 어댑터로만 SQL에 접속한다.
const adapter = new PrismaPg({ connectionString });

// 핫 리로드마다 커넥션 풀이 새로 생기지 않게 개발에서는 globalThis에 붙인다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type DbClient = Prisma.TransactionClient;

export type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

export function withTransaction<T>(
  fn: (db: DbClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, options);
}
