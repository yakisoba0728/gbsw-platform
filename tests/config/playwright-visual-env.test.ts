import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyVisualFileEnvironment,
  loadVisualFileEnvironment,
  resolveVisualDatabaseUrls,
} from "../../playwright.visual.env";

const BASELINE = "postgresql://visual:a@localhost:5433/gbsw_visual_main";
const REDESIGN = "postgresql://visual:b@127.0.0.1:5433/gbsw_visual_redesign";

describe("resolveVisualDatabaseUrls", () => {
  it("서로 다른 loopback visual DB 두 개를 사용한다", () => {
    expect(
      resolveVisualDatabaseUrls(
        {
          VISUAL_BASELINE_DATABASE_URL: BASELINE,
          VISUAL_REDESIGN_DATABASE_URL: REDESIGN,
          DATABASE_URL: "postgresql://dev:dev@localhost:5433/gbsw",
          TEST_DATABASE_URL: "postgresql://test:test@localhost:5433/gbsw_test",
        },
        {},
      ),
    ).toEqual({ baseline: BASELINE, redesign: REDESIGN });
  });

  it("두 URL 중 하나라도 없으면 일반 DB로 fallback하지 않는다", () => {
    expect(() =>
      resolveVisualDatabaseUrls(
        { VISUAL_BASELINE_DATABASE_URL: BASELINE, DATABASE_URL: REDESIGN },
        {},
      ),
    ).toThrow(/모두 필요/);
  });

  it("자격 증명과 schema가 달라도 같은 물리 DB면 거부한다", () => {
    expect(() =>
      resolveVisualDatabaseUrls(
        {
          VISUAL_BASELINE_DATABASE_URL:
            "postgresql://one:a@localhost:5433/gbsw_visual?schema=main",
          VISUAL_REDESIGN_DATABASE_URL:
            "postgresql://two:b@127.0.0.1:5433/gbsw_visual?schema=redesign",
        },
        {},
      ),
    ).toThrow(/같은 물리 데이터베이스/);
  });

  it("개발·통합·E2E DB와 겹치면 거부한다", () => {
    for (const key of [
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "E2E_DATABASE_URL",
    ]) {
      expect(() =>
        resolveVisualDatabaseUrls(
          {
            VISUAL_BASELINE_DATABASE_URL: BASELINE,
            VISUAL_REDESIGN_DATABASE_URL: REDESIGN,
            [key]: "postgresql://other:secret@127.0.0.1:5433/gbsw_visual_main",
          },
          {},
        ),
      ).toThrow(new RegExp(key));
    }
  });

  it("원격 DB와 visual 표시가 없는 이름은 거부한다", () => {
    expect(() =>
      resolveVisualDatabaseUrls(
        {
          VISUAL_BASELINE_DATABASE_URL:
            "postgresql://a:b@db.internal:5432/gbsw_visual_main",
          VISUAL_REDESIGN_DATABASE_URL: REDESIGN,
        },
        {},
      ),
    ).toThrow(/localhost/);
    expect(() =>
      resolveVisualDatabaseUrls(
        {
          VISUAL_BASELINE_DATABASE_URL:
            "postgresql://a:b@localhost:5433/gbsw_main",
          VISUAL_REDESIGN_DATABASE_URL: REDESIGN,
        },
        {},
      ),
    ).toThrow(/visual/);
  });

  it("Playwright --list dry-run에서만 안전한 placeholder를 허용한다", () => {
    expect(
      resolveVisualDatabaseUrls({ VISUAL_COMPARE_DRY_RUN: "1" }, {}),
    ).toEqual({
      baseline: expect.stringContaining("gbsw_visual_main"),
      redesign: expect.stringContaining("gbsw_visual_redesign"),
    });
  });

  it("pg가 authority보다 우선하는 host/port query를 거부한다", () => {
    for (const suffix of [
      "?host=db.internal",
      "?port=6543",
      "?HOST=127.0.0.1",
    ]) {
      expect(() =>
        resolveVisualDatabaseUrls(
          {
            VISUAL_BASELINE_DATABASE_URL: `${BASELINE}${suffix}`,
            VISUAL_REDESIGN_DATABASE_URL: REDESIGN,
          },
          {},
        ),
      ).toThrow(/query string의 host\/port/);
    }
  });

  it("dev-local/visual.env를 .env 뒤에 읽고 셸 값은 보존한다", () => {
    const root = mkdtempSync(path.join(tmpdir(), "gbsw-visual-env-"));
    try {
      mkdirSync(path.join(root, "dev-local"));
      writeFileSync(
        path.join(root, ".env"),
        "VISUAL_BASELINE_PORT=4100\nVISUAL_PARENT_EMAIL=base@example.invalid\n",
      );
      writeFileSync(
        path.join(root, "dev-local", "visual.env"),
        "VISUAL_BASELINE_PORT=4200\nVISUAL_STUDENT_EMAIL=student@example.invalid\n",
      );

      const fileEnvironment = loadVisualFileEnvironment(root);
      expect(fileEnvironment).toMatchObject({
        VISUAL_BASELINE_PORT: "4200",
        VISUAL_PARENT_EMAIL: "base@example.invalid",
        VISUAL_STUDENT_EMAIL: "student@example.invalid",
      });

      const environment = { VISUAL_BASELINE_PORT: "4300" };
      applyVisualFileEnvironment(environment, fileEnvironment);
      expect(environment).toMatchObject({
        VISUAL_BASELINE_PORT: "4300",
        VISUAL_STUDENT_EMAIL: "student@example.invalid",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
