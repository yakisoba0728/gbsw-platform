import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import {
  applyVisualFileEnvironment,
  loadVisualFileEnvironment,
  resolveVisualDatabaseUrls,
} from "./playwright.visual.env";
import {
  VISUAL_ROLES,
  VISUAL_VIEWPORTS,
  visualOrigin,
  type VisualTarget,
} from "./tests/visual/visual.manifest";
import { resolveVisualRuntime } from "./tests/visual/visual.runtime";

const localEnv = loadVisualFileEnvironment();
applyVisualFileEnvironment(process.env, localEnv);
const runtime = resolveVisualRuntime();
const databases = resolveVisualDatabaseUrls(process.env, localEnv);
const uploadRoots = {
  baseline: path.join(
    runtime.repoRoot,
    "dev-local",
    "visual-uploads",
    "baseline",
  ),
  redesign: path.join(
    runtime.repoRoot,
    "dev-local",
    "visual-uploads",
    "redesign",
  ),
} as const;

function authSecret(target: VisualTarget): string {
  const key =
    target === "baseline"
      ? "VISUAL_BASELINE_AUTH_SECRET"
      : "VISUAL_REDESIGN_AUTH_SECRET";
  const explicit = process.env[key];
  if (explicit && explicit.length < 32)
    throw new Error(`${key}은 32자 이상이어야 합니다.`);
  return explicit || randomBytes(32).toString("base64url");
}

const secrets = {
  baseline: authSecret("baseline"),
  redesign: authSecret("redesign"),
};
if (secrets.baseline === secrets.redesign) {
  throw new Error(
    "baseline과 redesign의 Better Auth secret은 서로 달라야 합니다.",
  );
}

function serverEnvironment(target: VisualTarget): Record<string, string> {
  const port = runtime.ports[target];
  const teacherOrigin = visualOrigin(target, "teacher", runtime.ports);
  const trustedOrigins = [
    ...VISUAL_ROLES.map((role) => visualOrigin(target, role, runtime.ports)),
    `http://127.0.0.1:${port}`,
  ];

  return {
    DATABASE_URL: databases[target],
    BETTER_AUTH_SECRET: secrets[target],
    // 학생증 QR의 절대 주소도 이 값을 쓴다. 판독 담당 교사 세션이 있는 host로 둔다.
    BETTER_AUTH_URL: teacherOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins.join(","),
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    UPLOAD_DIR: uploadRoots[target],
    NEXT_TELEMETRY_DISABLED: "1",
    VISUAL_COMPARE_TARGET: target,
  };
}

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: ["**/*.visual.spec.ts", "**/*.visual.setup.ts"],
  outputDir: path.join(runtime.artifactRoot, "playwright"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    [
      path.join(
        runtime.repoRoot,
        "tests",
        "visual",
        "side-by-side.reporter.ts",
      ),
      { outputFile: path.join(runtime.artifactRoot, "index.html") },
    ],
  ],
  use: {
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "visual-auth",
      testMatch: "**/auth.visual.setup.ts",
      use: { viewport: VISUAL_VIEWPORTS.desktop },
    },
    {
      name: "visual-fixtures",
      testMatch: "**/fixtures.visual.setup.ts",
      dependencies: ["visual-auth"],
      use: { viewport: VISUAL_VIEWPORTS.desktop },
    },
    {
      name: "visual-desktop",
      testMatch: "**/compare.visual.spec.ts",
      dependencies: ["visual-fixtures"],
      use: { viewport: VISUAL_VIEWPORTS.desktop },
    },
    {
      name: "visual-mobile",
      testMatch: "**/compare.visual.spec.ts",
      dependencies: ["visual-fixtures"],
      use: { viewport: VISUAL_VIEWPORTS.mobile },
    },
    {
      name: "visual-redirects",
      testMatch: "**/redirects.visual.spec.ts",
      dependencies: ["visual-fixtures"],
      use: { viewport: VISUAL_VIEWPORTS.desktop },
    },
  ],
  webServer: [
    {
      name: "baseline",
      cwd: runtime.baselineRoot,
      command: "node scripts/start-standalone.mjs",
      url: `http://127.0.0.1:${runtime.ports.baseline}/api/health`,
      env: serverEnvironment("baseline"),
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: "redesign",
      cwd: runtime.redesignRoot,
      command: "node scripts/start-standalone.mjs",
      url: `http://127.0.0.1:${runtime.ports.redesign}/api/health`,
      env: serverEnvironment("redesign"),
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
