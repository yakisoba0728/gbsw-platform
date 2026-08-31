import { expect, test } from "@playwright/test";
import {
  buildVisualRedirectContracts,
  VISUAL_TARGETS,
  visualOrigin,
} from "./visual.manifest";
import {
  loadVisualFixtureManifest,
  resolveVisualRuntime,
  visualStorageStatePath,
} from "./visual.runtime";
import {
  readRedirectObservation,
  type RedirectObservation,
} from "./redirect-observation";

const runtime = resolveVisualRuntime();
const redirects = buildVisualRedirectContracts(
  loadVisualFixtureManifest(runtime),
);

function comparableUrl(url: URL): {
  pathname: string;
  search: [string, string][];
} {
  return { pathname: url.pathname, search: [...url.searchParams].sort() };
}

for (const contract of redirects) {
  test(`${contract.role} › ${contract.id} › ${contract.label}`, async ({
    browser,
  }, testInfo) => {
    const results: Record<string, RedirectObservation> = {};
    const errors: string[] = [];
    const baseMeta = {
      kind: "redirect",
      role: contract.role,
      id: contract.id,
      label: contract.label,
      from: contract.from,
      to: contract.to,
    } as const;

    // Browser/context/request 생성 자체가 실패해도 HTML 보고서에서 이 계약이
    // 사라지지 않도록 실제 요청 전에 placeholder metadata를 남긴다.
    await testInfo.attach("visual-meta", {
      body: Buffer.from(
        JSON.stringify({
          ...baseMeta,
          baseline: {
            httpStatus: 0,
            contractStatus: null,
            location: null,
            mechanism: "none",
          },
          redesign: {
            httpStatus: 0,
            contractStatus: null,
            location: null,
            mechanism: "none",
          },
        }),
      ),
      contentType: "application/json",
    });

    for (const target of VISUAL_TARGETS) {
      const origin = visualOrigin(target, contract.role, runtime.ports);
      const context = await browser.newContext({
        storageState: visualStorageStatePath(runtime, target, contract.role),
      });
      try {
        const response = await context.request.get(
          new URL(contract.from, origin).href,
          {
            maxRedirects: 0,
            headers: { accept: "text/html" },
          },
        );
        const expectedStatus = contract.permanent ? 308 : 307;
        const observation = await readRedirectObservation(response);
        if (observation.contractStatus !== expectedStatus) {
          errors.push(
            `${target}: ${expectedStatus} redirect 계약 대신 HTTP ${observation.httpStatus} (${observation.mechanism})`,
          );
        }
        if (!observation.location) {
          errors.push(`${target}: redirect 목적지 없음`);
          results[target] = observation;
          continue;
        }
        const actual = new URL(observation.location, origin);
        const expected = new URL(contract.to, origin);
        if (
          JSON.stringify(comparableUrl(actual)) !==
          JSON.stringify(comparableUrl(expected))
        ) {
          errors.push(
            `${target}: ${actual.pathname}${actual.search} → 예상 ${contract.to}`,
          );
        }
        results[target] = {
          ...observation,
          location: `${actual.pathname}${actual.search}`,
        };
      } finally {
        await context.close();
      }
    }

    // Reporter는 이 완료 metadata를 우선하고, 여기까지 오지 못한 실패에서는
    // 위 placeholder를 사용한다.
    await testInfo.attach("visual-meta-result", {
      body: Buffer.from(
        JSON.stringify({
          ...baseMeta,
          baseline: results.baseline || {
            httpStatus: 0,
            contractStatus: null,
            location: null,
            mechanism: "none",
          },
          redesign: results.redesign || {
            httpStatus: 0,
            contractStatus: null,
            location: null,
            mechanism: "none",
          },
        }),
      ),
      contentType: "application/json",
    });
    expect(errors, "redirect 계약 불일치").toEqual([]);
  });
}
