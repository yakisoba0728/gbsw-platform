import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL 환경변수가 없습니다. .env.example을 .env로 복사했는지 확인하세요.",
  );
}

const adapter = new PrismaPg({ connectionString });

// 개발 핫 리로드마다 커넥션 풀이 늘어나지 않도록 재사용한다.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type DbClient = Prisma.TransactionClient;

type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

// 트랜잭션 예산. 도메인마다 기다려야 하는 잠금이 다르므로 매직넘버 대신 이름으로 쓴다.
export const TX_BUDGETS = {
  // 상벌점 부여(단건·일괄) — 현재 학년도·규정 행 잠금 경합을 기다리는 여유.
  meritAward: { timeout: 30_000, maxWait: 5_000 },
} as const satisfies Record<string, TransactionOptions>;

export function withTransaction<T>(
  fn: (db: DbClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, options);
}
