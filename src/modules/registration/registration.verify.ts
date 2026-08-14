/**
 * 가입 2차 요소 대조.
 *
 * 코드가 1차 비밀이고, 여기서 대조하는 값들은 **코드가 엉뚱한 사람에게 전달됐을 때**를
 * 막는 2차 요소다. 그래서 "맞다/틀리다"만 돌려주고 무엇이 틀렸는지는 알리지 않는다.
 */

/**
 * 이름 정규화 — 앞뒤 공백을 없애고 내부 연속 공백을 하나로 줄이고, 유니코드
 * 정규화 형식을 NFC로 통일한다 (I8).
 *
 * 한글은 완성형(NFC)과 조합형(NFD)의 바이트가 달라 `===`가 false다. 관리자가
 * 초대코드를 만들 때 입력한 이름(macOS 도구를 거치면 NFD가 섞일 수 있다)과
 * 학생이 가입 화면에서 타이핑한 이름이 서로 다른 정규화 형식이면, 눈에는
 * 완전히 같아 보여도 대조가 실패해 5회 만에 초대코드가 자동 폐기됐다.
 * "홍 길동", "홍  길동", " 홍 길동 " 을 모두 같게 본다.
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
