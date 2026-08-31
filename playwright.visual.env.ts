import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

type Environment = Readonly<Record<string, string | undefined>>;
type MutableEnvironment = Record<string, string | undefined>;

export type VisualDatabaseUrls = Readonly<{
  baseline: string;
  redesign: string;
}>;

type ParsedDatabase = Readonly<{
  value: string;
  target: string;
  database: string;
  loopback: boolean;
}>;

const VISUAL_URL_KEYS = {
  baseline: "VISUAL_BASELINE_DATABASE_URL",
  redesign: "VISUAL_REDESIGN_DATABASE_URL",
} as const;

const DRY_RUN_DATABASE_URLS: VisualDatabaseUrls = {
  baseline: "postgresql://visual:visual@127.0.0.1:5433/gbsw_visual_main",
  redesign: "postgresql://visual:visual@127.0.0.1:5433/gbsw_visual_redesign",
};

const OTHER_DATABASE_KEYS = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "E2E_DATABASE_URL",
  "PLAYWRIGHT_DATABASE_URL",
] as const;

/** `.env` 다음 ignored `dev-local/visual.env`를 읽어 visual 전용 값이 이기게 한다. */
export function loadVisualFileEnvironment(
  cwd: string = process.cwd(),
): Environment {
  const merged: Record<string, string> = {};
  for (const filename of [".env", path.join("dev-local", "visual.env")]) {
    const filePath = path.resolve(cwd, filename);
    if (!existsSync(filePath)) continue;
    Object.assign(merged, parseEnv(readFileSync(filePath, "utf8")));
  }
  return merged;
}

/**
 * Playwright worker도 credential/port/root 값을 읽으므로 config가 읽은 파일 값을
 * 자식 process 환경에 전달한다. 셸에서 명시한 값은 절대 덮어쓰지 않는다.
 */
export function applyVisualFileEnvironment(
  environment: MutableEnvironment,
  fileEnvironment: Environment,
): void {
  for (const [key, value] of Object.entries(fileEnvironment)) {
    if (environment[key] === undefined && value !== undefined)
      environment[key] = value;
  }
}

function fromEnvironment(
  key: string,
  environment: Environment,
  fileEnvironment: Environment,
): string | undefined {
  return environment[key] || fileEnvironment[key];
}

function parseDatabase(value: string, label: string): ParsedDatabase {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}이 올바른 PostgreSQL URL이 아닙니다.`);
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label}은 PostgreSQL URL이어야 합니다.`);
  }

  // node-postgres의 connection-string parser는 query의 host/port를 URL authority보다
  // 우선한다. 여기서 authority만 검사하면 `?host=db.internal`로 loopback 제한과
  // 두 DB 충돌 검사를 모두 우회할 수 있으므로 routing query 자체를 허용하지 않는다.
  const routingKeys = [...url.searchParams.keys()].filter((key) =>
    ["host", "port"].includes(key.toLowerCase()),
  );
  if (routingKeys.length > 0) {
    throw new Error(
      `${label}은 query string의 host/port를 사용할 수 없습니다.`,
    );
  }

  const rawHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(rawHost);
  const host = loopback ? "loopback" : rawHost;
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (!database) throw new Error(`${label}에 데이터베이스 이름이 없습니다.`);

  return {
    value,
    target: `${host}:${port}/${database}`,
    database,
    loopback,
  };
}

function parseVisualDatabase(value: string, label: string): ParsedDatabase {
  const parsed = parseDatabase(value, label);

  if (!parsed.loopback) {
    throw new Error(
      `${label}은 localhost/127.0.0.1/::1 데이터베이스만 허용합니다.`,
    );
  }
  if (!parsed.database.toLowerCase().includes("visual")) {
    throw new Error(`${label} 데이터베이스 이름에는 visual이 들어가야 합니다.`);
  }

  return parsed;
}

/**
 * 라이브 비교는 로그인만으로도 세션 행을 쓰므로 두 앱이 같은 DB를 공유하지 않는다.
 * 일반·통합·기존 E2E DB와도 물리 대상(host/port/database)이 하나라도 겹치면
 * 서버를 띄우기 전에 중단한다. 자격 증명과 schema 쿼리는 격리 근거가 아니다.
 */
export function resolveVisualDatabaseUrls(
  environment: Environment,
  fileEnvironment: Environment,
): VisualDatabaseUrls {
  const dryRun = environment.VISUAL_COMPARE_DRY_RUN === "1";
  const values = {
    baseline:
      fromEnvironment(VISUAL_URL_KEYS.baseline, environment, fileEnvironment) ||
      (dryRun ? DRY_RUN_DATABASE_URLS.baseline : undefined),
    redesign:
      fromEnvironment(VISUAL_URL_KEYS.redesign, environment, fileEnvironment) ||
      (dryRun ? DRY_RUN_DATABASE_URLS.redesign : undefined),
  };

  if (!values.baseline || !values.redesign) {
    throw new Error(
      "비교 실행에는 VISUAL_BASELINE_DATABASE_URL과 VISUAL_REDESIGN_DATABASE_URL이 모두 필요합니다.",
    );
  }

  const baseline = parseVisualDatabase(
    values.baseline,
    VISUAL_URL_KEYS.baseline,
  );
  const redesign = parseVisualDatabase(
    values.redesign,
    VISUAL_URL_KEYS.redesign,
  );

  if (baseline.target === redesign.target) {
    throw new Error(
      "baseline과 redesign이 같은 물리 데이터베이스를 가리킵니다.",
    );
  }

  for (const key of OTHER_DATABASE_KEYS) {
    const value = fromEnvironment(key, environment, fileEnvironment);
    if (!value) continue;

    const other = parseDatabase(value, key);
    if (other.target === baseline.target || other.target === redesign.target) {
      throw new Error(
        `visual 비교 DB가 ${key}와 같은 물리 데이터베이스를 가리킵니다.`,
      );
    }
  }

  return { baseline: baseline.value, redesign: redesign.value };
}
