import "server-only";
import { randomInt } from "node:crypto";
import { ALPHABET, BODY_LENGTH, PREFIX } from "./invite-code";

/**
 * 초대코드 생성. 저장 형태는 하이픈 없는 `GBSWXXXXXXXX`다.
 * randomInt를 쓴다 — `% ALPHABET.length`는 모듈로 편향이 생긴다.
 */
export function generateInviteCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}
