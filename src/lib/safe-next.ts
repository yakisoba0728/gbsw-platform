/**
 * 로그인 뒤 돌아갈 경로. **오픈 리다이렉트를 막는 유일한 자리**라 검사를 여기
 * 하나에만 둔다 — 호출부마다 되풀이하면 한 곳이 빠지는 날 그게 구멍이 된다.
 *
 * 우리 앱 안의 절대 경로만 통과한다. `//`와 `/\`는 브라우저가 프로토콜 상대
 * 주소로 읽어 남의 사이트로 나간다.
 */
const MAX_LENGTH = 512;

/** 제어문자는 헤더 주입의 통로다. 문자 클래스에 직접 적지 않고 코드포인트로 본다. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (hasControlChar(value)) return null;
  return value;
}
