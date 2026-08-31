import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";
import { resolveE2eDatabaseUrl } from "./playwright.env";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const localEnv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const databaseUrl = resolveE2eDatabaseUrl(process.env, localEnv);
const authSecret = process.env.BETTER_AUTH_SECRET ?? localEnv.BETTER_AUTH_SECRET;
// 배포의 `/app/uploads`와 같은 명시적 볼륨 경계를 쓰되, 로컬 운영 첨부와는
// 섞이지 않는 Playwright 전용 루트로 고정한다. 절대 경로여야 dev와 standalone의
// 서로 다른 실행 진입점에서도 같은 디렉터리를 본다.
const uploadDir = path.resolve(
  process.env.PLAYWRIGHT_UPLOAD_DIR ?? path.join(".uploads", "e2e"),
);

// Config에서 읽은 .env 값은 webServer뿐 아니라 E2E worker의 DB 픽스처에도
// 필요하다. DATABASE_URL을 덮어쓰면 worker가 config를 다시 읽을 때 위의
// 운영 DB 충돌 검사가 우리가 주입한 값을 오인하므로 전용 변수로만 넘긴다.
process.env.PLAYWRIGHT_DATABASE_URL = databaseUrl;
process.env.UPLOAD_DIR = uploadDir;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI
      // npm을 한 겹 두면 Playwright가 종료한 셸의 Next 자식 프로세스가
      // 고아로 남을 수 있다. 서버를 직접 추적해 테스트 종료와 함께 내린다.
      ? "node scripts/start-standalone.mjs"
      : `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/login`,
    env: {
      BETTER_AUTH_URL: BASE_URL,
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      UPLOAD_DIR: uploadDir,
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      ...(authSecret ? { BETTER_AUTH_SECRET: authSecret } : {}),
    },
    // 기존 서버를 재사용하면 위 UPLOAD_DIR/DB가 적용됐는지 보장할 수 없어
    // 첨부 smoke가 다른 프로세스를 상대로 거짓 통과할 수 있다.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
