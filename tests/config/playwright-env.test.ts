import { describe, expect, it } from "vitest";
import { resolveE2eDatabaseUrl } from "../../playwright.env";

const E2E = "postgresql://test:test@localhost:5433/gbsw_e2e";

describe("resolveE2eDatabaseUrl", () => {
  it("명시적인 E2E_DATABASE_URL을 사용한다", () => {
    expect(
      resolveE2eDatabaseUrl(
        { E2E_DATABASE_URL: E2E, DATABASE_URL: "postgresql://dev:dev@localhost:5433/gbsw" },
        {},
      ),
    ).toBe(E2E);
  });

  it("TEST_DATABASE_URL도 격리된 테스트 DB로 허용한다", () => {
    expect(resolveE2eDatabaseUrl({}, { TEST_DATABASE_URL: E2E })).toBe(E2E);
  });

  it("명시적인 테스트 DB가 없으면 일반 DATABASE_URL로 떨어지지 않는다", () => {
    expect(() =>
      resolveE2eDatabaseUrl(
        { DATABASE_URL: "postgresql://prod:secret@db.internal:5432/gbsw" },
        {},
      ),
    ).toThrow(/E2E_DATABASE_URL|TEST_DATABASE_URL/);
  });

  it("자격 증명이 달라도 일반 DB와 같은 호스트·포트·DB면 거부한다", () => {
    expect(() =>
      resolveE2eDatabaseUrl(
        {
          E2E_DATABASE_URL: "postgresql://test:test@db.internal:5432/gbsw?schema=e2e",
          DATABASE_URL: "postgresql://prod:secret@db.internal:5432/gbsw?schema=public",
        },
        {},
      ),
    ).toThrow(/같은 데이터베이스/);
  });

  it("worker에 전달한 Playwright 전용 변수는 일반 DB로 오인하지 않는다", () => {
    expect(
      resolveE2eDatabaseUrl(
        {
          E2E_DATABASE_URL: E2E,
          PLAYWRIGHT_DATABASE_URL: E2E,
          DATABASE_URL: "postgresql://dev:dev@localhost:5433/gbsw",
        },
        {},
      ),
    ).toBe(E2E);
  });
});
