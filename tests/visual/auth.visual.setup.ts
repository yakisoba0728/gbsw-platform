import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { VISUAL_ROLES, VISUAL_TARGETS, visualOrigin } from "./visual.manifest";
import {
  resolveVisualCredentials,
  resolveVisualRuntime,
  visualStorageStatePath,
} from "./visual.runtime";

const runtime = resolveVisualRuntime();
const credentials = resolveVisualCredentials();

for (const target of VISUAL_TARGETS) {
  for (const role of VISUAL_ROLES) {
    test(`${target} ${role} 역할 세션`, async ({ browser }) => {
      const origin = visualOrigin(target, role, runtime.ports);
      const credential = credentials[role];
      const context = await browser.newContext({
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/login`, { waitUntil: "load" });
        await page.getByLabel("이메일").fill(credential.email);
        await page.getByLabel("비밀번호").fill(credential.password);
        await page.getByRole("button", { name: "로그인" }).click();
        await page.waitForURL((url) => url.origin === origin && url.pathname === "/");

        const sessionResponse = await context.request.get(`${origin}/api/auth/get-session`);
        expect(sessionResponse.ok()).toBe(true);
        const session = (await sessionResponse.json()) as {
          user?: { role?: unknown; email?: unknown };
        };
        expect(session.user?.role).toBe(credential.expectedRole);
        expect(session.user?.email).toBe(credential.email);

        const statePath = visualStorageStatePath(runtime, target, role);
        await mkdir(path.dirname(statePath), { recursive: true });
        await context.storageState({ path: statePath });
      } finally {
        await context.close();
      }
    });
  }
}
