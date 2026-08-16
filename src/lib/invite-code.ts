/**
 * 초대코드 알파벳 — 31자.
 * 손으로 옮겨 적다 틀리기 쉬운 0/O, 1/I/L 을 뺐다.
 *
 * generate-invite-code.ts(생성기, node:crypto를 문다)가 이 값을 가져다 쓴다.
 * 이 파일 자체는 crypto를 물지 않는다 (M15) — "use client" 파일
 * (import-form.tsx)이 formatInviteCode를 쓰므로, crypto가 필요한 생성기와
 * 반드시 분리해 둔다.
 */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 시안의 `GBSW-0000-0000` 형식을 따른다. */
export const PREFIX = "GBSW";

/**
 * 본문 길이. 31^8 ≈ 8.5 × 10^11 이고, 여기에 이름·생년월일 대조와 5회 실패
 * 폐기가 겹친다 (근거는 generate-invite-code.ts와 초대·가입 설계 문서).
 *
 * **혼자 바꿀 수 없는 값이다.** 4-4 표시 묶음(formatInviteCode)과 등록 화면의
 * 입력 마스크(lib/masks.ts의 formatInviteCodeInput — 본문을 8자에서 자른다)가
 * 이 길이에 걸려 있다. 여기만 올리면 새 코드가 마스크에서 잘려 가입이 안 되고,
 * 이미 인쇄해 나눠 준 코드의 표시 묶음도 달라진다.
 */
export const BODY_LENGTH = 8;

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
