import { sameDatabaseTarget } from "./scripts/database-target.mjs";

type Environment = Readonly<Record<string, string | undefined>>;

// E2E는 데이터를 변경하므로 일반 DATABASE_URL로 대체하지 않는다.
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
  if (sameDatabaseTarget(ambient, explicit)) {
    throw new Error(
      "Playwright 테스트 DB가 일반 DATABASE_URL과 같은 데이터베이스를 가리킵니다.",
    );
  }

  return explicit;
}
