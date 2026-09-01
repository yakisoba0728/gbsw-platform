/**
 * 접속 문자열 둘이 **같은 물리 데이터베이스**를 가리키는지 판정한다.
 *
 * 문자열 완전일치로는 갈라지지 않는다 — `localhost`와 `127.0.0.1`, 포트 생략,
 * `?schema=` 유무, 자격 증명만 다른 URL이 전부 같은 DB일 수 있다. 파괴적인
 * 테스트 스위트가 개발 DB에 붙는 사고를 막는 판정이라 한 자리에만 둔다:
 * Playwright(`playwright.env.ts`)·vitest의 integration 프로젝트
 * (`vitest.config.mts`)·`setup-test-db.sh`가 모두 이 파일을 쓴다.
 * 셸에서도 부를 수 있어야 해서 TypeScript가 아니라 `.mjs`다.
 */

/**
 * 호스트·포트·DB 이름만 남긴 비교용 열쇠. 사용자명·비밀번호·쿼리는 버린다.
 * 파싱하지 못하면 원문끼리 비교한다 — 판정을 못 했다고 통과시키지 않는다.
 *
 * @param {string} connectionString
 * @returns {string}
 */
export function databaseTarget(connectionString) {
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
 * 한쪽이 없으면 「같지 않다」로 본다 — 값이 있어야 하는지는 호출부의 필수
 * 검사가 따로 다룬다.
 *
 * @param {string | undefined} a
 * @param {string | undefined} b
 * @returns {boolean}
 */
export function sameDatabaseTarget(a, b) {
  if (!a || !b) return false;
  return databaseTarget(a) === databaseTarget(b);
}
