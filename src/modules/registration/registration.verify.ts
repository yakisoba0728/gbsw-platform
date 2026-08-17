/**
 * 가입 2차 요소 대조 — 코드가 엉뚱한 사람에게 갔을 때를 막는다.
 * 이름은 NFC로 통일한다 (I8) — 한글은 NFC와 NFD의 바이트가 달라 눈에 같아도
 * `===`가 false다.
 */
export function normalizeName(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").normalize("NFC");
}

export function nameMatches(expected: string, actual: string): boolean {
  return normalizeName(expected) === normalizeName(actual);
}

/** 생년월일은 YYYY-MM-DD 문자열끼리 완전 일치해야 한다. */
export function birthDateMatches(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}
