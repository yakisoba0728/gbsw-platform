/**
 * 가입 2차 요소 대조.
 *
 * 코드가 1차 비밀이고, 여기서 대조하는 값들은 **코드가 엉뚱한 사람에게 전달됐을 때**를
 * 막는 2차 요소다. 그래서 "맞다/틀리다"만 돌려주고 무엇이 틀렸는지는 알리지 않는다.
 */

/**
 * 이름 정규화 — 앞뒤 공백을 없애고 내부 연속 공백을 하나로 줄인다.
 * "홍 길동", "홍  길동", " 홍 길동 " 을 모두 같게 본다.
 */
export function normalizeName(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

export function nameMatches(expected: string, actual: string): boolean {
  return normalizeName(expected) === normalizeName(actual);
}

/** 생년월일은 YYYY-MM-DD 문자열끼리 완전 일치해야 한다. */
export function birthDateMatches(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}
