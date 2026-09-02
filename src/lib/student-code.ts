import { randomInt } from "node:crypto";

export const STUDENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const STUDENT_CODE_LENGTH = 8;

const LETTERS = STUDENT_CODE_ALPHABET.replaceAll(/[0-9]/g, "");

export function generateStudentCode(): string {
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
