import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/**
 * .env에서 TEST_DATABASE_URL만 읽는다 — integration 프로젝트 하나에만 필요하다.
 *
 * `process.loadEnvFile(".env")`(prisma.config.ts가 쓰는 방식)는 process.env를
 * 통째로 바꿔버려서 unit 프로젝트까지 오염시킨다 — 실제로 .env의
 * VERIFICATION_MOCK=true가 새어 들어가 verification.service.test.ts의
 * requestCode() 목 검증이 전부 목업 경로로 빠지며 깨졌다. parseEnv는
 * process.env를 건드리지 않고 파일 내용만 파싱하므로 이 문제가 없다.
 */
function readTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!existsSync(".env")) return "";
  const parsed = parseEnv(readFileSync(".env", "utf8"));
  return parsed.TEST_DATABASE_URL ?? "";
}

export default defineConfig({
  resolve: {
    // tsconfig의 @/* 별칭을 Vite가 직접 해석한다 (vite-tsconfig-paths 불필요).
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    projects: [
      {
        // 기본(단위) 스위트. `npm test`/`npm run verify:unit`이 도는 대상이다.
        // 실제 DB가 없어도 통과해야 한다 (I7). .env를
        // 전혀 읽지 않는다 — 개발용 .env 값(VERIFICATION_MOCK 등)이 새어
        // 들어가면 목 기반 단위 테스트가 조용히 다른 경로를 타게 된다.
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
          // 실제 접속은 하지 않는다. core/db/client가 임포트 시점에 던지지
          // 않게만 해준다 — repo 테스트는 전부 @/core/db/client를 목으로 대체한다.
          env: {
            DATABASE_URL: "postgresql://test:test@localhost:5432/test",
            VERIFICATION_MOCK: "",
          },
        },
      },
      {
        // repo 계층 통합 스위트 (I7). 실 Postgres(gbsw_test, 개발 DB와 분리)에
        // 붙는다 — `npm run db:test:setup`으로 준비하고 `npm run test:integration`
        // 으로 돌린다. `npm run verify`는 이 프로젝트까지 포함하는 완전 검증이다.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          // TEST_DATABASE_URL이 없으면 core/db/client가 즉시 던진다 — DB 없이
          // 이 프로젝트를 돌리면 "DATABASE_URL 환경변수가 없습니다"로 바로
          // 실패해야지, 실수로 기본(가짜) DB URL을 쓰면 안 된다.
          env: {
            DATABASE_URL: readTestDatabaseUrl(),
          },
          // 여러 테스트가 실 트랜잭션·유일 제약 경합을 검증한다 — 파일을 병렬로
          // 돌리면 서로 다른 커넥션이 같은 픽스처 정리 시점과 겹칠 수 있다.
          fileParallelism: false,
        },
      },
    ],
  },
});
