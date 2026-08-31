/**
 * 초대코드 알파벳 31자 — 손으로 옮겨 적다 틀리는 0/O, 1/I/L 을 뺐다.
 * 이 파일은 crypto를 물지 않는다 (M15) — 클라이언트 컴포넌트가 이걸 쓴다.
 */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** `GBSW-0000-0000` 형식. */
export const PREFIX = "GBSW";

/**
 * 본문 길이. 혼자 바꿀 수 없다 — formatInviteCode의 4-4 묶음과 masks.ts의
 * 입력 마스크가 이 길이에 걸려 있어, 여기만 올리면 새 코드가 잘려 가입이 막힌다.
 */
export const BODY_LENGTH = 8;

/** 화면에 보여줄 형태로 끊어준다. `GBSWA3K92M7P` → `GBSW-A3K9-2M7P` */
export function formatInviteCode(code: string): string {
  const body = code.startsWith(PREFIX) ? code.slice(PREFIX.length) : code;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * 더는 가입에 쓸 수 없는 코드를 목록에 식별 가능한 만큼만 남긴다.
 * `GBSW-A3K9-2M7P` → `GBSW-••••-2M7P`.
 */
export function maskInviteCode(code: string): string {
  const formatted = formatInviteCode(normalizeInviteCode(code));
  return `${PREFIX}-••••-${formatted.slice(-4)}`;
}

/** 입력한 코드를 저장 형태로 되돌린다. 대소문자·하이픈·GBSW 누락을 흘려보낸다. */
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
