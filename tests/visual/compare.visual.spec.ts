import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  assertUniqueVisualRoutes,
  buildVisualRoutes,
  VISUAL_TARGETS,
  VISUAL_VIEWPORTS,
  visualOrigin,
  type VisualRoute,
  type VisualTarget,
  type VisualViewport,
} from "./visual.manifest";
import {
  loadVisualFixtureManifest,
  resolveVisualRuntime,
  visualScreenshotPath,
  visualStorageStatePath,
} from "./visual.runtime";

const runtime = resolveVisualRuntime();
const routes = buildVisualRoutes(loadVisualFixtureManifest(runtime));
assertUniqueVisualRoutes(routes);

function viewportForProject(projectName: string): VisualViewport {
  if (projectName === "visual-desktop") return "desktop";
  if (projectName === "visual-mobile") return "mobile";
  throw new Error(`알 수 없는 visual viewport project입니다: ${projectName}`);
}

async function openRoute(
  browser: Browser,
  target: VisualTarget,
  route: VisualRoute,
  viewport: VisualViewport,
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: VISUAL_VIEWPORTS[viewport],
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ...(route.session === "anonymous"
      ? {}
      : { storageState: visualStorageStatePath(runtime, target, route.role) }),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  try {
    // 초 단위 상단 시계만 고정한다. 서버의 pass 판정 시각은 fixture가 경계에서
    // 충분히 멀어야 하며, 브라우저 clock을 서버 시각의 대용으로 오인하지 않는다.
    await page.clock.setFixedTime(runtime.browserTime);
    // 카메라 화면은 하드웨어 지원 여부가 아니라 명시적인 미지원 상태를 비교한다.
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "BarcodeDetector", {
        configurable: true,
        value: undefined,
      });
    });

    const origin = visualOrigin(target, route.role, runtime.ports);
    const expected = new URL(route.path, origin);
    const response = await page.goto(expected.href, { waitUntil: "load" });
    expect(response, `${target} ${route.path} 응답이 없습니다.`).not.toBeNull();
    expect(
      response?.status(),
      `${target} ${route.path} 상태 코드`,
    ).toBeLessThan(400);

    const actual = new URL(page.url());
    expect(actual.origin).toBe(origin);
    expect(actual.pathname).toBe(expected.pathname);
    expect([...actual.searchParams].sort()).toEqual(
      [...expected.searchParams].sort(),
    );

    await page
      .locator(route.readySelector || "body")
      .first()
      .waitFor({ state: "visible" });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });

    const expectedHeadings =
      typeof route.expectedVisibleHeadings === "number"
        ? route.expectedVisibleHeadings
        : route.expectedVisibleHeadings?.[target] || 1;
    await expect(page.locator("h1:visible")).toHaveCount(expectedHeadings);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${target} ${route.path} 문서에 심각한 가로 overflow가 있습니다.`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    return { context, page, errors };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function captureFullPage(
  page: Page,
  route: VisualRoute,
  outputPath: string,
): Promise<void> {
  // 앱 셸은 문서가 아니라 내부 main만 스크롤한다. width/반응형 상태는 유지하면서
  // 비교 캡처에서만 높이와 overflow를 풀어 긴 표·로그·통계를 끝까지 포함한다.
  await page.addStyleTag({
    content: `
      html, body {
        height: auto !important;
        min-height: 100% !important;
        overflow: visible !important;
      }
      [class~="h-dvh"] {
        height: auto !important;
        min-height: 100vh !important;
        overflow: visible !important;
      }
      main {
        flex: none !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
    `,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  const mask = [
    page.locator("header time"),
    ...(route.maskSelectors || []).map((s) => page.locator(s)),
  ];
  await page.screenshot({
    path: outputPath,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    mask,
    maskColor: "#ff00ff",
  });
}

for (const route of routes) {
  test(`${route.role} › ${route.id} › ${route.label}`, async ({
    browser,
  }, testInfo) => {
    const viewport = viewportForProject(testInfo.project.name);
    const paths = {
      baseline: visualScreenshotPath(
        runtime,
        viewport,
        route.role,
        route.id,
        "baseline",
      ),
      redesign: visualScreenshotPath(
        runtime,
        viewport,
        route.role,
        route.id,
        "redesign",
      ),
    };
    // 같은 artifact root를 재사용하므로 이번 run이 캡처 전에 실패해도 reporter가
    // 이전 run PNG를 현재 결과로 오인하지 않게 대상 두 파일부터 지운다.
    await Promise.all([
      rm(paths.baseline, { force: true }),
      rm(paths.redesign, { force: true }),
    ]);
    await testInfo.attach("visual-meta", {
      body: Buffer.from(
        JSON.stringify({
          kind: "comparison",
          viewport,
          role: route.role,
          id: route.id,
          label: route.label,
          path: route.path,
          baselinePath: paths.baseline,
          redesignPath: paths.redesign,
        }),
      ),
      contentType: "application/json",
    });

    const settled = await Promise.allSettled(
      VISUAL_TARGETS.map((target) =>
        openRoute(browser, target, route, viewport),
      ),
    );
    const opened = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    try {
      const failed = settled.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      if (opened.length !== 2)
        throw new Error("baseline/redesign 페이지를 모두 열지 못했습니다.");

      await Promise.all([
        captureFullPage(opened[0].page, route, paths.baseline),
        captureFullPage(opened[1].page, route, paths.redesign),
      ]);

      await testInfo.attach("visual-baseline", {
        path: paths.baseline,
        contentType: "image/png",
      });
      await testInfo.attach("visual-redesign", {
        path: paths.redesign,
        contentType: "image/png",
      });
      expect(
        opened.flatMap((item) => item.errors),
        "브라우저 pageerror",
      ).toEqual([]);
    } finally {
      await Promise.all(opened.map((item) => item.context.close()));
    }
  });
}
