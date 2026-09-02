import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";
import { resolveE2eDatabaseUrl } from "./playwright.env";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const localEnv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const databaseUrl = resolveE2eDatabaseUrl(process.env, localEnv);
const authSecret = process.env.BETTER_AUTH_SECRET || localEnv.BETTER_AUTH_SECRET;
const uploadDir = path.resolve(
  process.env.PLAYWRIGHT_UPLOAD_DIR || path.join(".uploads", "e2e"),
);

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
      ? "node scripts/start-standalone.mjs"
      : `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/login`,
    env: {
      BETTER_AUTH_URL: BASE_URL,
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      UPLOAD_DIR: uploadDir,
      DATABASE_URL: databaseUrl,
      ...(authSecret ? { BETTER_AUTH_SECRET: authSecret } : {}),
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
