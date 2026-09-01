/**
 * 입력칸 자동 서식. 영숫자를 넣거나 빼지 않고 서식 문자만 끼워 넣는다 —
 * 그래야 커서 위치를 "앞쪽 영숫자 개수"로 되돌릴 수 있다.
 */

/** 서식 문자가 아닌, 값 자체를 이루는 문자 */
export const SIGNIFICANT = /[A-Za-z0-9]/;

export function countSignificant(value: string): number {
  let count = 0;
  for (const char of value) if (SIGNIFICANT.test(char)) count += 1;
  return count;
}

/** 영숫자 n개를 지난 지점의 문자열 인덱스 — 커서 복원용 */
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

/**
 * `01012345678` → `010-1234-5678` (구형 10자리는 3-3-4)
 *
 * 국제 표기를 먼저 국내 표기로 접는다. 폰 연락처가 주는 값이 `+82 10-…`이라
 * 붙여넣기로 흔히 들어오는데, 그냥 숫자만 뽑으면 국가번호 82가 국번 자리로
 * 올라가 `821-0123-4567`이라는 없는 번호가 된다.
 */
export function formatPhone(input: string): string {
  const d = input
    // 연락처 앱마다 `+82 10`, `+82 010`, `(+82) 10`, `82 10`처럼 내보내는
    // 모양이 다르다. 국가번호 뒤의 국내 0은 있으면 소비한 뒤 하나만 되살린다.
    .replace(/^\s*\(?(?:\+|00)?82\)?[\s-]*0?/, "0")
    .replaceAll(/\D/g, "")
    .slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * `gbsw3hh25nfk` → `GBSW-3HH2-5NFK`. GBSW를 자동으로 붙이지 않는다 —
 * 안 친 글자를 넣으면 커서가 어긋난다. 앞머리는 서버가 채운다.
 */
export function formatInviteCodeInput(input: string): string {
  const s = input.toUpperCase().replaceAll(/[^A-Z0-9]/g, "");

  if (s.startsWith("GBSW")) {
    const body = s.slice(4, 12);
    return ["GBSW", body.slice(0, 4), body.slice(4)].filter(Boolean).join("-");
  }

  const body = s.slice(0, 8);
  return [body.slice(0, 4), body.slice(4)].filter(Boolean).join("-");
}

/** `123456` — 숫자만, 6자리 */
export function formatVerificationCode(input: string): string {
  return input.replaceAll(/\D/g, "").slice(0, 6);
}
