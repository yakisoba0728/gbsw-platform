import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";
import { sameDatabaseTarget } from "./scripts/database-target.mjs";

/**
 * .env에서 두 값만 읽는다 — integration 프로젝트가 붙을 TEST_DATABASE_URL과,
 * 그것이 개발 DB가 아닌지 대조할 DATABASE_URL.
 *
 * `process.loadEnvFile(".env")`(prisma.config.ts가 쓰는 방식)는 process.env를
 * 통째로 바꿔버려서 unit 프로젝트까지 오염시킨다 — 실제로 .env의
 * VERIFICATION_MOCK=true가 새어 들어가 verification.service.test.ts의
 * requestCode() 목 검증이 전부 목업 경로로 빠지며 깨졌다. parseEnv는
 * process.env를 건드리지 않고 파일 내용만 파싱하므로 이 문제가 없다.
 */
function readTestDatabaseUrl(): string {
  const fileEnv: Record<string, string | undefined> = existsSync(".env")
    ? parseEnv(readFileSync(".env", "utf8"))
    : {};
  const testUrl = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL || "";

  // 아래 integration 프로젝트가 DATABASE_URL에 이 값을 그대로 주입한다. 글자까지
  // 같으면 그건 개발 DB가 아니라 우리가 넣은 값이므로 비교 대상에서 뺀다 —
  // playwright.config.ts에 같은 함정이 적혀 있다.
  const ambient =
    process.env.DATABASE_URL === testUrl ? undefined : process.env.DATABASE_URL;
  const developmentUrl = ambient || fileEnv.DATABASE_URL;

  // 통합 스위트는 파괴적이다 — 현재 학년도의 isCurrent를 끄고 되돌리는
  // 테스트까지 있어 개발 DB에 붙으면 집계 범위가 조용히 어긋난 채 남는다.
  // 설정을 읽는 지금 멈춘다. 문자열 완전일치로는 `localhost`↔`127.0.0.1`,
  // `?schema=` 유무가 전부 「다른 값」이 되어 그대로 통과한다.
  if (sameDatabaseTarget(developmentUrl, testUrl)) {
    throw new Error(
      "TEST_DATABASE_URL이 DATABASE_URL과 같은 데이터베이스를 가리킵니다 — .env에서 서로 다른 DB로 나누세요.",
    );
  }

  return testUrl;
}

export default defineConfig({
  resolve: {
    // tsconfig의 @/* 별칭을 Vite가 직접 해석한다 (vite-tsconfig-paths 불필요).
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // 실행 중 우연히 import된 파일만 세면 새 무테스트 모듈이 지표에서
      // 사라진다. 생성물을 제외한 production source 전체를 분모에 둔다.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.d.ts"],
      thresholds: {
        // 전체 production source 기준 현재 baseline(51.52/40.70/39.13/51.29)을
        // 내림한 값이다. 새 파일도 0%로 포함되므로 무테스트 코드 추가가 이
        // gate를 우회하지 못한다.
        statements: 51,
        branches: 40,
        functions: 39,
        lines: 51,
      },
    },
    projects: [
      {
        // 기본(단위) 스위트. `npm test`/`npm run verify:unit`이 도는 대상이다.
        // 실제 DB가 없어도 통과해야 한다 (I7). .env를
        // 전혀 읽지 않는다 — 개발용 .env 값(VERIFICATION_MOCK 등)이 새어
        // 들어가면 목 기반 단위 테스트가 조용히 다른 경로를 타게 된다.
        extends: true,
        test: {
          name: "unit",
          // `.tsx`도 잡는다 — 컴포넌트가 실제로 내보내는 HTML을 검사하는
          // 테스트(마크다운 살균 등)는 JSX가 있어야 쓸 수 있다.
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
