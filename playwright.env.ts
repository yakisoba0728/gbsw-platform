type Environment = Readonly<Record<string, string | undefined>>;

function databaseTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const rawHost = url.hostname.toLowerCase();
    const host = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(rawHost)
      ? "loopback"
      : rawHost;
    const port = url.port || "5432";
    const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return `${host}:${port}/${database}`;
  } catch {
    return `raw:${connectionString}`;
  }
}

/**
 * Playwright는 실제 INSERT/DELETE를 수행하므로 일반 DATABASE_URL로 절대
 * fallback하지 않는다. 전용 변수가 있어도 같은 물리 DB를 가리키면 오타로 보고
 * 중단한다 — 사용자명·비밀번호·schema 쿼리가 달라도 DB 자체는 같을 수 있다.
 */
export function resolveE2eDatabaseUrl(
  environment: Environment,
  fileEnvironment: Environment,
): string {
  const explicit =
    environment.E2E_DATABASE_URL ||
    environment.TEST_DATABASE_URL ||
    fileEnvironment.E2E_DATABASE_URL ||
    fileEnvironment.TEST_DATABASE_URL;

  if (!explicit) {
    throw new Error(
      "Playwright에는 E2E_DATABASE_URL 또는 TEST_DATABASE_URL이 필요합니다. 일반 DATABASE_URL은 사용하지 않습니다.",
    );
  }

  const ambient = environment.DATABASE_URL || fileEnvironment.DATABASE_URL;
  if (ambient && databaseTarget(ambient) === databaseTarget(explicit)) {
    throw new Error(
      "Playwright 테스트 DB가 일반 DATABASE_URL과 같은 데이터베이스를 가리킵니다.",
    );
  }

  return explicit;
}
