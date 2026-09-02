const SIGNIFICANT = /[A-Za-z0-9]/;

export function countSignificant(value: string): number {
  let count = 0;
  for (const char of value) if (SIGNIFICANT.test(char)) count += 1;
  return count;
}

// 마스크 삽입 전 영숫자 개수로 커서를 복원한다.
export function offsetAfterSignificant(value: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (SIGNIFICANT.test(value[i]!)) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return value.length;
}

export function formatPhone(input: string): string {
  // +82 표기를 국내 0으로 정규화한 뒤 구분자를 제거한다.
  const d = input
    .replace(/^\s*\(?(?:\+|00)?82\)?[\s-]*0?/, "0")
    .replaceAll(/\D/g, "")
    .slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 입력하지 않은 GBSW 접두사를 붙이면 커서가 어긋나므로 서버에서 채운다.
export function formatInviteCodeInput(input: string): string {
  const s = input.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");

  if (s.startsWith("GBSW")) {
    const body = s.slice(4, 12);
    return ["GBSW", body.slice(0, 4), body.slice(4)].filter(Boolean).join("-");
  }

  const body = s.slice(0, 8);
  return [body.slice(0, 4), body.slice(4)].filter(Boolean).join("-");
}

export function formatVerificationCode(input: string): string {
  return input.replaceAll(/\D/g, "").slice(0, 6);
}
