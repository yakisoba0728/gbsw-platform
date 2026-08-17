import { randomInt } from "node:crypto";

/**
 * 학생 식별자. 한 번 부여하고 절대 바뀌지 않는다 — 학번 형태를 쓰지 않는 이유다.
 * 식별자가 사실을 담으면 그 사실이 틀렸을 때 과거 기록과의 연결이 끊긴다.
 */

/** 초대코드와 같은 알파벳 — 0·1·I·O·L을 뺀다. 종이로 옮겨 적는 값이라서다. */
export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const STUDENT_CODE_LENGTH = 8;

const LETTERS = STUDENT_CODE_ALPHABET.replaceAll(/[0-9]/g, "");

export function generateStudentCode(): string {
  // 첫 글자는 반드시 문자다 — 숫자로 시작하면 엑셀이 수로 읽는다 (2E5 → 200000).
  let id = LETTERS[randomInt(LETTERS.length)]!;
  for (let i = 1; i < STUDENT_CODE_LENGTH; i++) {
    id += STUDENT_CODE_ALPHABET[randomInt(STUDENT_CODE_ALPHABET.length)];
  }
  return id;
}

export function isStudentCode(value: unknown): boolean {
  if (typeof value !== "string" || value.length !== STUDENT_CODE_LENGTH) return false;
  if (!LETTERS.includes(value[0]!)) return false;
  return [...value].every((ch) => STUDENT_CODE_ALPHABET.includes(ch));
}
