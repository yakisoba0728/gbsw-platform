import { sameDatabaseTarget } from "./database-target.mjs";

if (sameDatabaseTarget(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL)) {
  console.error(
    "[test-db] TEST_DATABASE_URL이 DATABASE_URL과 같은 데이터베이스를 가리킵니다 — 개발 DB를 건드릴 수 있어 중단합니다.",
  );
  process.exit(1);
}
