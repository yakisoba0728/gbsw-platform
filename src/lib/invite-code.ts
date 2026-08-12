import { randomInt } from "node:crypto";

/**
 * 초대코드 알파벳 — 31자.
 * 손으로 옮겨 적다 틀리기 쉬운 0/O, 1/I/L 을 뺐다.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 시안의 `GBSW-0000-0000` 형식을 따른다. */
const PREFIX = "GBSW";
const BODY_LENGTH = 8;

/**
 * 초대코드 생성. 저장 형태는 하이픈 없는 `GBSWXXXXXXXX`다.
 *
 * randomInt는 모듈로 편향 없이 균등하게 뽑는다 (`% ALPHABET.length`를 쓰면 안 된다).
 * 31^8 ≈ 8.5 × 10^11 이고, 여기에 이름·생년월일 대조와 5회 실패 폐기가 더해진다.
 */
export function generateInviteCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}

/** 화면에 보여줄 형태로 끊어준다. `GBSWA3K92M7P` → `GBSW-A3K9-2M7P` */
export function formatInviteCode(code: string): string {
  const body = code.startsWith(PREFIX) ? code.slice(PREFIX.length) : code;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * 사용자가 입력한 코드를 저장 형태로 되돌린다.
 * 구두로 받아 적는 경우가 많아 대소문자·하이픈·공백을 흘려보내고,
 * 앞의 GBSW를 빼먹었어도 채워준다.
 */
export function normalizeInviteCode(input: string): string {
  const bare = input.trim().toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
  return bare.startsWith(PREFIX) ? bare : PREFIX + bare;
}

export type InviteUsability = {
  status: string;
  expiresAt: Date | null;
};

/** 아직 쓸 수 있는 코드인가. */
export function isInviteUsable(
  invite: InviteUsability,
  now: Date = new Date(),
): boolean {
  if (invite.status !== "PENDING") return false;
  if (invite.expiresAt && invite.expiresAt <= now) return false;
  return true;
}

/** 2차 요소를 몇 번 틀리면 코드를 폐기하는가. */
export const MAX_INVITE_ATTEMPTS = 5;
