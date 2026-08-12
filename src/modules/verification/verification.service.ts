import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import * as repo from "./verification.repo";
import {
  normalizeTarget,
  type VerificationChannel,
} from "./verification.schema";
import { sendVerification } from "./verification.sender";

/**
 * 이메일·전화번호 확인.
 *
 * 가입 이전 경로라 `can()`을 쓰지 않는다 (부트스트랩·가입과 같은 예외).
 * 대신 대상별 발송 횟수 제한과 코드 대조 실패 제한으로 남용을 막는다.
 */

export class VerificationError extends Error {}

/** 코드 유효시간 */
const TTL_MINUTES = 5;
/** 코드 대조 실패 허용 횟수 */
const MAX_ATTEMPTS = 5;
/** 같은 대상에 한 시간 동안 보낼 수 있는 횟수 */
const MAX_SENDS_PER_HOUR = 5;
/** 확인 후 이 시간 안에 가입을 마쳐야 한다 */
const VERIFIED_TTL_MINUTES = 30;

/**
 * 목업 모드 — 발송한 코드를 화면에 그대로 채워 준다.
 *
 * 발송 수단이 아직 없을 때 가입 흐름을 눌러보기 위한 장치다.
 * **코드를 클라이언트로 돌려주는 순간 인증은 의미가 없어지므로**,
 * 개발 빌드에서 플래그를 명시했을 때만 켜진다. 둘 중 하나라도 어긋나면 꺼진다.
 */
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

/** 인증코드 발송. 같은 대상의 이전 코드는 무효가 된다. */
export async function requestCode(
  channel: VerificationChannel,
  rawTarget: string,
): Promise<{ mockCode?: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const recent = await repo.countRecentSends(
    channel,
    target,
    new Date(now.getTime() - 60 * 60_000),
  );
  if (recent >= MAX_SENDS_PER_HOUR) {
    throw new VerificationError(
      "인증번호를 너무 많이 요청했습니다. 잠시 후 다시 시도하세요.",
    );
  }

  await repo.expirePending(channel, target, now);

  // randomInt는 균등 분포다. 0으로 시작하는 코드도 나오므로 6자리로 채운다.
  const code = randomInt(1_000_000).toString().padStart(6, "0");

  const row = await repo.insertCode({
    channel,
    target,
    codeHash: hash(code),
    expiresAt: minutesFromNow(TTL_MINUTES, now),
  });

  if (isMockVerification()) {
    // 목업에서는 발송을 건너뛴다. 발송사 설정이 안 끝나도 흐름을 눌러볼 수 있어야 한다.
    console.log(`[인증코드·목업] ${channel} ${target} : ${code}`);
    return { mockCode: code };
  }

  try {
    await sendVerification({ channel, target, code });
  } catch (error) {
    // 발송이 실패했으면 방금 만든 코드는 무의미하다. 지워서 시간당 한도를 갉아먹지 않게 한다.
    await repo.deleteById(row.id);

    // 공급자 오류 원문(키·IP·계정 정보가 섞여 있다)은 서버에만 남기고
    // 사용자에게는 일반화된 문구만 보여준다.
    console.error("[인증코드] 발송 실패", error);
    throw new VerificationError(
      "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  return isMockVerification() ? { mockCode: code } : {};
}

/** 사용자가 입력한 코드를 대조한다. */
export async function confirmCode(
  channel: VerificationChannel,
  rawTarget: string,
  code: string,
): Promise<void> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();

  const row = await repo.findLiveCode(channel, target, now);
  if (!row) {
    throw new VerificationError(
      "인증번호가 만료되었습니다. 다시 요청해 주세요.",
    );
  }

  if (!matches(row.codeHash, code)) {
    const attempts = await repo.bumpAttempts(row.id);
    if (attempts >= MAX_ATTEMPTS) {
      await repo.expireById(row.id, now);
      throw new VerificationError(
        "인증번호를 여러 번 틀렸습니다. 다시 요청해 주세요.",
      );
    }
    throw new VerificationError("인증번호가 올바르지 않습니다.");
  }

  await repo.markVerified(row.id, now);
}

/**
 * 가입 시점에 호출한다. 확인이 끝난 코드 행을 돌려주며, 없으면 던진다.
 * 클라이언트가 "인증했다"고 주장하는 건 신뢰하지 않는다 — 항상 DB로 확인한다.
 */
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
        ? "이메일 인증을 먼저 완료해 주세요."
        : "휴대폰 인증을 먼저 완료해 주세요.",
    );
  }
  return { id: row.id };
}

/** 가입이 끝나면 쓴 코드를 소진 처리한다. */
export async function consumeVerifications(ids: string[]): Promise<void> {
  await repo.consume(ids, new Date());
}
