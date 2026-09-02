import "server-only";
import { randomInt } from "node:crypto";
import { ALPHABET, BODY_LENGTH, PREFIX } from "./invite-code";

export function generateInviteCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}
