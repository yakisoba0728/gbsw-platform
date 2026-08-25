import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 최초 교사 생성용 1회성 토큰. 프로세스 메모리에만 둔다.
 * globalThis에 붙인다 — 모듈 지역 변수면 부팅 훅과 서버 액션이 다른 값을 본다.
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
 * 토큰을 검증하고 즉시 소진한다. await가 없어 본문이 끊기지 않으므로,
 * 동시 요청 중 true를 받는 쪽이 하나뿐인 것이 중복 생성을 막는 잠금이다.
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
