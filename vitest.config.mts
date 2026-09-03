import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";
import { sameDatabaseTarget } from "./scripts/database-target.mjs";

function readTestDatabaseUrl(): string {
  // 테스트 밖의 환경 변수는 덮어쓰지 않고 DB 주소만 읽는다.
  const fileEnv: Record<string, string | undefined> = existsSync(".env")
    ? parseEnv(readFileSync(".env", "utf8"))
    : {};
  const testUrl = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL || "";

  // Vitest가 프로젝트에 주입한 테스트 URL을 개발 DB 주소로 오인하지 않는다.
  const ambient =
    process.env.DATABASE_URL === testUrl ? undefined : process.env.DATABASE_URL;
  const developmentUrl = ambient || fileEnv.DATABASE_URL;

  if (sameDatabaseTarget(developmentUrl, testUrl)) {
    throw new Error(
      "TEST_DATABASE_URL이 DATABASE_URL과 같은 데이터베이스를 가리킵니다 — .env에서 서로 다른 DB로 나누세요.",
    );
  }

  return testUrl;
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.d.ts"],
      thresholds: {
        statements: 51,
        branches: 40,
        functions: 39,
        lines: 51,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: ["tests/integration/**"],
          env: {
            DATABASE_URL: "postgresql://test:test@localhost:5432/test",
            VERIFICATION_MOCK: "",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          env: {
            DATABASE_URL: readTestDatabaseUrl(),
            // 인증코드 해시와 학생증 QR이 이 값에서 키를 파생한다. 단위 테스트는
            // 파일마다 직접 넣지만 통합 테스트는 실제 서비스를 그대로 부르므로
            // 프로젝트 env에 둔다 — 개발자·CI 환경의 실제 비밀에 기대지 않는다.
            BETTER_AUTH_SECRET: "test-only-secret-for-integration-0123456789",
          },
          fileParallelism: false,
        },
      },
    ],
  },
});
