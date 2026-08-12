/**
 * 입력칸 자동 서식.
 *
 * 원칙: **의미 있는 문자(영숫자)를 넣거나 빼지 않는다.** 서식 문자만 끼워 넣는다.
 * 그래야 커서 위치를 "앞쪽 영숫자 개수"로 정확히 되돌릴 수 있고,
 * 붙여넣기·자동완성·IME로 값이 통째로 바뀌어도 같은 규칙이 그대로 적용된다.
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

/** `01012345678` → `010-1234-5678` (구형 10자리는 3-3-4) */
export function formatPhone(input: string): string {
  const d = input.replaceAll(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * `gbsw3hh25nfk` → `GBSW-3HH2-5NFK`
 *
 * GBSW를 자동으로 붙이지는 않는다. 사용자가 치지 않은 글자를 넣으면
 * 커서 위치가 어긋나기 때문이다. 앞머리를 빼먹어도 서버가 채워준다.
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
