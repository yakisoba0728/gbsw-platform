import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const PASS_FLASH_COOKIE = "gbsw.pass-flash";
export const PASS_FLASH_HEADER = "x-gbsw-pass-flash";
export const PASS_FLASH_MAX_AGE_SECONDS = 120;

export const PASS_FLASH_KINDS = ["requested", "consented", "approved"] as const;
export type PassFlashKind = (typeof PASS_FLASH_KINDS)[number];

type Payload = {
  kind: PassFlashKind;
  userId: string;
  issuedAt: number;
  nonce: string;
};

const SIGNATURE_BYTES = 16;
const MAX_TOKEN_LENGTH = 768;
const MAX_CLOCK_SKEW_MS = 5_000;

function signingKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  return Buffer.from(hkdfSync("sha256", secret, "", "gbsw-pass-flash-v1", 32));
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

export function issuePassFlash(
  kind: PassFlashKind,
  userId: string,
  now: Date = new Date(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      kind,
      userId,
      issuedAt: now.getTime(),
      nonce: randomBytes(8).toString("base64url"),
    } satisfies Payload),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyPassFlash(
  token: string | null | undefined,
  now: Date = new Date(),
): Payload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isPayload(parsed)) return null;
  const age = now.getTime() - parsed.issuedAt;
  if (age < -MAX_CLOCK_SKEW_MS || age > PASS_FLASH_MAX_AGE_SECONDS * 1000) {
    return null;
  }
  return parsed;
}

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Payload>;
  return (
    typeof candidate.kind === "string" &&
    (PASS_FLASH_KINDS as readonly string[]).includes(candidate.kind) &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    candidate.userId.length <= 128 &&
    typeof candidate.issuedAt === "number" &&
    Number.isSafeInteger(candidate.issuedAt) &&
    typeof candidate.nonce === "string" &&
    /^[A-Za-z0-9_-]{11}$/.test(candidate.nonce)
  );
}
