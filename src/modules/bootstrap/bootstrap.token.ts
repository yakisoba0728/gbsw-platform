import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 최초 관리자 생성용 1회성 토큰.
 *
 * 프로세스 메모리에만 둔다 — DB에 저장하지 않으므로 디스크에 남지 않고,
 * 프로세스가 죽으면 함께 사라진다. 서버를 재시작하면 새 토큰이 발급된다.
 *
 * globalThis에 붙이는 이유: instrumentation 훅과 서버 액션이 서로 다른 번들로
 * 묶일 수 있고, 개발 중 핫 리로드가 모듈을 다시 평가한다. 모듈 지역 변수로 두면
 * 발급한 토큰과 검증하는 토큰이 다른 인스턴스가 될 수 있다.
 */
const store = globalThis as unknown as { __gbswBootstrapToken?: string | null };

function read(): string | null {
  return store.__gbswBootstrapToken ?? null;
}

function write(value: string | null): void {
  store.__gbswBootstrapToken = value;
}

/** 새 토큰을 발급하고 이전 토큰을 무효화한다. */
export function issueToken(): string {
  const token = randomBytes(32).toString("base64url");
  write(token);
  return token;
}

/** 검증만 하고 소진하지 않는다 — 페이지 렌더 게이트용. */
export function matchesToken(candidate: string): boolean {
  const current = read();
  if (!current) return false;
  return safeEqual(candidate, current);
}

/**
 * 토큰을 검증하고 즉시 소진한다.
 *
 * Node는 단일 스레드라 이 함수 본문이 중간에 끊기지 않는다(await가 없다).
 * 따라서 동시에 들어온 요청 중 true를 받는 쪽은 반드시 하나뿐이며,
 * 이것이 관리자 계정 중복 생성을 막는 실질적인 잠금 역할을 한다.
 */
export function consumeToken(candidate: string): boolean {
  if (!matchesToken(candidate)) return false;
  write(null);
  return true;
}

/** 계정 생성이 실패했을 때 소진한 토큰을 되돌린다. */
export function restoreToken(token: string): void {
  write(token);
}

/** 부트스트랩이 더 이상 필요 없을 때 토큰을 없앤다. */
export function clearToken(): void {
  write(null);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual은 길이가 다르면 던진다. 길이 자체는 비밀이 아니다.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
