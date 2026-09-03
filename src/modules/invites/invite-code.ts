export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const PREFIX = "GBSW";

export const BODY_LENGTH = 8;

export function formatInviteCode(code: string): string {
  const body = code.startsWith(PREFIX) ? code.slice(PREFIX.length) : code;
  return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function maskInviteCode(code: string): string {
  const formatted = formatInviteCode(normalizeInviteCode(code));
  return `${PREFIX}-••••-${formatted.slice(-4)}`;
}

export function normalizeInviteCode(input: string): string {
  const bare = input.trim().toUpperCase().replaceAll(/[^A-Z0-9]/g, "");
  return bare.startsWith(PREFIX) ? bare : PREFIX + bare;
}

type InviteUsability = {
  status: string;
  expiresAt: Date | null;
};

export function isInviteUsable(
  invite: InviteUsability,
  now: Date = new Date(),
): boolean {
  if (invite.status !== "PENDING") return false;
  if (invite.expiresAt && invite.expiresAt <= now) return false;
  return true;
}

export const MAX_INVITE_ATTEMPTS = 5;
