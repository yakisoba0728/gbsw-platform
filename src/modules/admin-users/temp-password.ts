import { randomInt } from "node:crypto";

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

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
}
