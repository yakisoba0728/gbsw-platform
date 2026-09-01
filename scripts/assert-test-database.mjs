/**
 * `setup-test-db.sh`가 부르는 가드.
 *
 * 통합 스위트는 파괴적이다 — 현재 학년도의 `isCurrent`를 끄고 되돌리는
 * 테스트까지 있어, 개발 DB에 한 번 붙으면 실 계정·감사로그·집계 범위가
 * 오류 하나 없이 어긋난 채 남는다. 그래서 같은 데이터베이스를 가리키면
 * 마이그레이션을 적용하기 전에 멈춘다.
 */
import { sameDatabaseTarget } from "./database-target.mjs";

if (sameDatabaseTarget(process.env.DATABASE_URL, process.env.TEST_DATABASE_URL)) {
  console.error(
    "[test-db] TEST_DATABASE_URL이 DATABASE_URL과 같은 데이터베이스를 가리킵니다 — 개발 DB를 건드릴 수 있어 중단합니다.",
  );
  process.exit(1);
}
