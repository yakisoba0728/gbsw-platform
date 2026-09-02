import { randomBytes, timingSafeEqual } from "node:crypto";

// 부팅 훅과 서버 액션의 서로 다른 모듈 인스턴스가 같은 메모리 토큰을 본다.
const store = globalThis as unknown as { __gbswBootstrapToken?: string | null };

function read(): string | null {
  return store.__gbswBootstrapToken ?? null;
}

function write(value: string | null): void {
  store.__gbswBootstrapToken = value;
}

export function issueToken(): string {
  const token = randomBytes(32).toString("base64url");
  write(token);
  return token;
}

export function matchesToken(candidate: string): boolean {
  const current = read();
  if (!current) return false;
  return safeEqual(candidate, current);
}

export function consumeToken(candidate: string): boolean {
  // 검증과 소진 사이에 await를 두면 중복 생성 요청이 함께 통과할 수 있다.
  if (!matchesToken(candidate)) return false;
  write(null);
  return true;
}

export function restoreToken(token: string): void {
  write(token);
}

export function clearToken(): void {
  write(null);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
