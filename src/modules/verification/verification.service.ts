import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { readRequestContext } from "@/core/audit/request-context";
import { type DbClient, withTransaction } from "@/core/db/client";
import { VerificationError } from "./verification.error";
import * as repo from "./verification.repo";
import {
  normalizeTarget,
  type VerificationChannel,
} from "./verification.schema";
import {
  maskVerificationTarget,
  sendVerification,
} from "./verification.sender";

export { VerificationError };

const TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
// 학교 공용 IP에서는 가입 한 명이 이메일·전화 두 번을 소모한다.
export const MAX_SENDS_PER_HOUR_PER_IP = 60;
const VERIFIED_TTL_MINUTES = 30;
const RATE_LIMIT_MESSAGE =
  "인증번호를 너무 많이 요청했습니다. 한 시간 뒤에 다시 요청하세요.";
const SAFE_DELIVERY_ERROR_CODES = new Set([
  "EAUTH",
  "ECONNECTION",
  "ECONNRESET",
  "EDNS",
  "EENVELOPE",
  "EMESSAGE",
  "ESOCKET",
  "ETIMEDOUT",
]);

function safeDeliveryErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    SAFE_DELIVERY_ERROR_CODES.has(error.code)
  ) {
    return error.code;
  }
  return "UNKNOWN";
}

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
}, now: Date) {
  const { ip } = await readRequestContext();
  const since = new Date(now.getTime() - 60 * 60_000);

  return withTransaction(async (tx) => {
    await repo.lockSendRateLimitBuckets(input.channel, input.target, ip, tx);

    // 프로세스 종료 등으로 활성화되지 못한 예약 행은 한도를 계산하기 전에
    // 정리한다. 그렇지 않으면 고아 행이 꽉 찬 대상은 정리 코드에 도달하지 못한다.
    await repo.deleteStaleReservations(input.channel, input.target, now, tx);

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

    // 실제 잠금 획득 순서가 createdAt에 반영되어 겹친 발송도 정확히 비교할 수 있게 한다.
    const reservedAt = new Date();
    // 외부 발송이 성공하기 전에는 새 코드가 확인 대상으로 보이지 않게 만료 상태로 예약한다.
    return repo.insertCode({
      ...input,
      expiresAt: reservedAt,
      requestIp: ip,
      createdAt: reservedAt,
    }, tx);
  });
}

async function activateSentCode(
  channel: VerificationChannel,
  target: string,
  id: string,
): Promise<boolean> {
  let activated = false;
  await withTransaction(async (tx) => {
    await repo.lockVerificationTarget(channel, target, tx);
    const activatedAt = new Date();
    const newerActivated = await repo.hasNewerActivatedCode(
      channel,
      target,
      id,
      activatedAt,
      tx,
    );

    // 더 최신 요청이 이미 발송까지 끝났다면 늦게 끝난 이전 발송으로 덮어쓰지 않는다.
    // 아직 예약(만료) 상태인 더 최신 요청은 성공 여부가 정해지지 않았으므로 무시한다.
    if (newerActivated) return;

    await repo.expirePending(channel, target, activatedAt, tx);
    await repo.activateCode(
      id,
      minutesFromNow(TTL_MINUTES, activatedAt),
      tx,
    );
    activated = true;
  });
  return activated;
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
  }, now);

  const mock = isMockVerification();

  let activated = false;
  try {
    if (!mock) await sendVerification({ channel, target, code });
    activated = await activateSentCode(channel, target, row.id);
  } catch (error) {
    // 실패한 발송이 한도를 차지하지 않게 하고, 기존 유효 코드는 그대로 둔다.
    await repo.deleteById(row.id);

    console.error("[인증코드] 발송 실패", {
      channel,
      target: maskVerificationTarget(channel, target),
      errorCode: safeDeliveryErrorCode(error),
    });
    throw new VerificationError(
      "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  if (!activated) {
    throw new VerificationError(
      "더 최근에 요청한 인증번호를 사용해 주세요.",
    );
  }

  if (mock) {
    return { mockCode: code };
  }

  return {};
}

export async function confirmCode(
  channel: VerificationChannel,
  rawTarget: string,
  code: string,
): Promise<void> {
  const target = normalizeTarget(channel, rawTarget);

  const result = await withTransaction(async (tx) => {
    // 발송·재발송과 확인을 같은 대상 잠금으로 직렬화해 병렬 대입을 막는다.
    await repo.lockVerificationTarget(channel, target, tx);
    // 잠금 대기 전 시각을 쓰면 그 사이 만료된 코드가 다시 살아난 것처럼 보일 수 있다.
    const now = new Date();
    const row = await repo.findLiveCode(channel, target, now, tx);
    if (!row) return "NO_LIVE_CODE" as const;

    if (matches(row.codeHash, code)) {
      await repo.markVerified(row.id, now, tx);
      return "VERIFIED" as const;
    }

    const attempts = await repo.bumpAttempts(row.id, tx);
    if (attempts >= MAX_ATTEMPTS) {
      await repo.expireById(row.id, now, tx);
      return "TOO_MANY_ATTEMPTS" as const;
    }
    return "MISMATCH" as const;
  });

  if (result === "NO_LIVE_CODE") {
    throw new VerificationError("인증번호가 만료되었습니다. 다시 요청해 주세요.");
  }
  if (result === "TOO_MANY_ATTEMPTS") {
    throw new VerificationError(
      "인증번호를 여러 번 틀렸습니다. 다시 요청해 주세요.",
    );
  }
  if (result === "MISMATCH") {
    throw new VerificationError("인증번호가 맞지 않습니다.");
  }
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
