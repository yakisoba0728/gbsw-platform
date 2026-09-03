import { randomBytes, randomInt } from "node:crypto";
import { readRequestContext } from "@/core/audit/request-context";
import { type DbClient, withTransaction } from "@/core/db/client";
import {
  hashVerificationCode,
  verificationCodeMatches,
} from "./verification.code-hash";
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
// 초대 하나로 임의의 수신처에 반복 발송하는 것을 막는다. 정상 가입자는 이메일·휴대폰
// 각각 몇 번의 재전송이면 끝나므로 두 채널을 합쳐 이 예산 안에 넉넉히 들어온다.
const MAX_SENDS_PER_HOUR_PER_INVITE = 10;
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

function minutesFromNow(minutes: number, now: Date): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

// 가입 전 인증에는 감사로그가 없으므로 대상·IP별 제한으로 남용을 막는다.
async function insertRateLimitedCode(input: {
  challengeId: string;
  inviteId: string | null;
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

    // 초대는 발송을 허가하는 유일한 열쇠다. 수신처를 바꿔 가며 부르는 것을 막는다.
    if (input.inviteId) {
      const recentByInvite = await repo.countRecentSendsByInvite(
        input.inviteId,
        since,
        tx,
      );
      if (recentByInvite >= MAX_SENDS_PER_HOUR_PER_INVITE) {
        throw new VerificationError(RATE_LIMIT_MESSAGE);
      }
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
  inviteId: string | null = null,
): Promise<{ challengeId: string; mockCode?: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const code = randomInt(1_000_000).toString().padStart(6, "0");
  // 발급 응답으로만 나가는 손잡이다. 대상 주소와 달리 요청한 본인만 안다.
  const challengeId = randomBytes(24).toString("base64url");

  // 비밀이 없으면 여기서 던져 코드 행을 만들지 않는다.
  const codeHash = hashVerificationCode(challengeId, channel, target, code);

  const row = await insertRateLimitedCode({
    challengeId,
    inviteId,
    channel,
    target,
    codeHash,
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
    return { challengeId, mockCode: code };
  }

  return { challengeId };
}

export async function confirmCode(
  challengeId: string,
  code: string,
): Promise<void> {
  const result = await withTransaction(async (tx) => {
    // 같은 challenge에 대한 병렬 대입을 한 줄로 세운다. 대상이 아니라 challenge를
    // 잠그므로, 대상 주소만 아는 제3자는 이 행에 닿지 못한다.
    await repo.lockChallenge(challengeId, tx);
    // 잠금 대기 전 시각을 쓰면 그 사이 만료된 코드가 다시 살아난 것처럼 보일 수 있다.
    const now = new Date();
    const row = await repo.findLiveByChallenge(challengeId, now, tx);
    if (!row) return "NO_LIVE_CODE" as const;

    if (
      verificationCodeMatches(
        row.codeHash,
        challengeId,
        row.channel as VerificationChannel,
        row.target,
        code,
      )
    ) {
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

/*
 * 확인된 proof를 challenge로 찾고, 그 proof가 지금 가입하려는 값·초대와 맞는지
 * 대조한다. 대상값만으로 찾으면 다른 초대로 확인한 proof를 가져다 쓸 수 있다.
 */
export async function requireVerified(input: {
  challengeId: string;
  channel: VerificationChannel;
  rawTarget: string;
  inviteId: string;
}): Promise<{ id: string }> {
  const target = normalizeTarget(input.channel, input.rawTarget);
  const cutoff = new Date(Date.now() - VERIFIED_TTL_MINUTES * 60_000);

  const row = await repo.findVerifiedByChallenge(input.challengeId, cutoff);

  const usable =
    row !== null &&
    row.channel === input.channel &&
    row.target === target &&
    row.inviteId === input.inviteId;

  if (!usable) {
    throw new VerificationError(
      input.channel === "EMAIL"
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
