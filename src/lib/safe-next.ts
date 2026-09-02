const MAX_LENGTH = 512;

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
  // 브라우저가 외부 호스트로 해석하는 프로토콜 상대 경로를 거부한다.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (hasControlChar(value)) return null;
  return value;
}
