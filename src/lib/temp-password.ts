import { randomInt } from "node:crypto";

/**
 * 교사가 구두로 전달할 임시 비밀번호. 혼동하기 쉬운 글자를 뺀 알파벳을 쓰고,
 * 대문자·소문자·숫자를 하나씩 넣어 규칙이 강해져도 걸리지 않게 한다.
 */
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
export const TEMP_PASSWORD_ALPHABET = UPPER + LOWER + DIGIT;
const ALL = TEMP_PASSWORD_ALPHABET;

export const TEMP_PASSWORD_LENGTH = 14;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

export function generateTempPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];

  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(ALL));

  // 앞 세 자리가 항상 대/소/숫자 순으로 나오지 않게 섞는다 (Fisher-Yates).
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
}
