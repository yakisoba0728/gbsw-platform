import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { readRequestContext } from "@/core/audit/request-context";
import { type DbClient, withTransaction } from "@/core/db/client";
import { VerificationError } from "./verification.error";
import * as repo from "./verification.repo";
import {
  normalizeTarget,
  type VerificationChannel,
} from "./verification.schema";
import { sendVerification } from "./verification.sender";

export { VerificationError };

const TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
// 학교 공용 IP에서는 가입 한 명이 이메일·전화 두 번을 소모한다.
export const MAX_SENDS_PER_HOUR_PER_IP = 60;
const VERIFIED_TTL_MINUTES = 30;
const TEMPORARY_BYPASS_HASH = "temporary-verification-bypass";
const RATE_LIMIT_MESSAGE =
  "인증번호를 너무 많이 요청했습니다. 한 시간 뒤에 다시 요청하세요.";

export function isMockVerification(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.VERIFICATION_MOCK === "true"
  );
}

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function matches(expectedHash: string, code: string): boolean {
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(hash(code));
  return a.length === b.length && timingSafeEqual(a, b);
}

function minutesFromNow(minutes: number, now: Date): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

// 가입 전 인증에는 감사로그가 없으므로 대상·IP별 제한으로 남용을 막는다.
async function insertRateLimitedCode(input: {
  channel: VerificationChannel;
  target: string;
  codeHash: string;
  expiresAt: Date;
  verifiedAt?: Date | null;
}, now: Date) {
  const { ip } = await readRequestContext();
  const since = new Date(now.getTime() - 60 * 60_000);

  return withTransaction(async (tx) => {
    await repo.lockSendRateLimitBuckets(input.channel, input.target, ip, tx);

    const recent = await repo.countRecentSends(input.channel, input.target, since, tx);
    if (recent >= MAX_SENDS_PER_HOUR) {
      throw new VerificationError(RATE_LIMIT_MESSAGE);
    }

    // 식별하지 못한 IP들을 하나의 공용 한도로 묶지 않는다.
    if (ip) {
      const recentByIp = await repo.countRecentSendsByIp(ip, since, tx);
      if (recentByIp >= MAX_SENDS_PER_HOUR_PER_IP) {
        throw new VerificationError(RATE_LIMIT_MESSAGE);
      }
    }

    await repo.expirePending(input.channel, input.target, now, tx);
    return repo.insertCode({ ...input, requestIp: ip }, tx);
  });
}

export async function requestCode(
  channel: VerificationChannel,
  rawTarget: string,
): Promise<{ mockCode?: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const code = randomInt(1_000_000).toString().padStart(6, "0");

  const row = await insertRateLimitedCode({
    channel,
    target,
    codeHash: hash(code),
    expiresAt: minutesFromNow(TTL_MINUTES, now),
  }, now);

  if (isMockVerification()) {
    console.log(`[인증코드·목업] ${channel} ${target} : ${code}`);
    return { mockCode: code };
  }

  try {
    await sendVerification({ channel, target, code });
  } catch (error) {
    // 실패한 발송이 한도를 차지하지 않게 한다.
    await repo.deleteById(row.id);

    console.error("[인증코드] 발송 실패", error);
    throw new VerificationError(
      "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  return {};
}

/** 실제 발송을 재개하기 전에도 DB proof를 한 번 소진해야 가입할 수 있다. */
export async function createTemporaryVerifiedProof(
  channel: VerificationChannel,
  rawTarget: string,
): Promise<{ id: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const row = await insertRateLimitedCode({
    channel,
    target,
    codeHash: TEMPORARY_BYPASS_HASH,
    expiresAt: minutesFromNow(VERIFIED_TTL_MINUTES, now),
    verifiedAt: now,
  }, now);

  return { id: row.id };
}

export async function confirmCode(
  channel: VerificationChannel,
  rawTarget: string,
  code: string,
): Promise<void> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const row = await repo.findLiveCode(channel, target, now);
  if (!row) {
    throw new VerificationError("인증번호가 만료되었습니다. 다시 요청해 주세요.");
  }

  if (!matches(row.codeHash, code)) {
    const attempts = await repo.bumpAttempts(row.id);
    if (attempts >= MAX_ATTEMPTS) {
      await repo.expireById(row.id, now);
      throw new VerificationError(
        "인증번호를 여러 번 틀렸습니다. 다시 요청해 주세요.",
      );
    }
    throw new VerificationError("인증번호가 맞지 않습니다.");
  }

  await repo.markVerified(row.id, now);
}

export async function requireVerified(
  channel: VerificationChannel,
  rawTarget: string,
): Promise<{ id: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const cutoff = new Date(Date.now() - VERIFIED_TTL_MINUTES * 60_000);

  const row = await repo.findVerified(channel, target, cutoff);
  if (!row) {
    throw new VerificationError(
      channel === "EMAIL"
        ? "이메일 인증을 먼저 해 주세요."
        : "휴대폰 인증을 먼저 해 주세요.",
    );
  }
  return { id: row.id };
}

export async function consumeVerifications(
  ids: string[],
  db?: DbClient,
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  const count = await repo.consume(uniqueIds, new Date(), db);
  if (count !== uniqueIds.length) {
    throw new VerificationError("인증 확인이 만료되었습니다. 다시 확인해 주세요.");
  }
}
