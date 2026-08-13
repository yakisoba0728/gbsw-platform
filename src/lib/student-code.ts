import { randomInt } from "node:crypto";

/**
 * 학생 식별자.
 *
 * 명단 파일의 첫 열이자 학생을 알아보는 유일한 기준이다.
 * 계정을 만들 때 한 번 부여하고 **절대 바뀌지 않는다** — 이름을 고쳐도, 반이 바뀌어도,
 * 1학년 배정을 나중에 바로잡아도 같은 학생으로 이어진다.
 *
 * 학번(입학년도+반+번호) 형태를 쓰지 않는 이유가 이것이다. 식별자가 어떤 사실을 담으면
 * 그 사실이 틀렸을 때 식별자를 고쳐야 하고, 그 순간 과거 기록과의 연결이 끊긴다.
 */

/** 초대코드와 같은 알파벳 — 0·1·I·O·L을 뺀다. 종이로 옮겨 적는 값이라서다. */
export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const STUDENT_CODE_LENGTH = 8;

const LETTERS = STUDENT_CODE_ALPHABET.replaceAll(/[0-9]/g, "");

export function generateStudentCode(): string {
  // 첫 글자는 반드시 문자다. 숫자로 시작하면 엑셀이 수로 인식해
  // 앞자리 0을 먹거나 지수 표기로 바꿔버린다 (2E5 → 200000).
  let id = LETTERS[randomInt(LETTERS.length)]!;
  for (let i = 1; i < STUDENT_CODE_LENGTH; i++) {
    // randomInt는 모듈로 편향 없이 균등하게 뽑는다.
    id += STUDENT_CODE_ALPHABET[randomInt(STUDENT_CODE_ALPHABET.length)];
  }
  return id;
}

export function isStudentCode(value: unknown): boolean {
  if (typeof value !== "string" || value.length !== STUDENT_CODE_LENGTH) return false;
  if (!LETTERS.includes(value[0]!)) return false;
  return [...value].every((ch) => STUDENT_CODE_ALPHABET.includes(ch));
}
