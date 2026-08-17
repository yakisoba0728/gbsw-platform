import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { readRequestContext } from "@/core/audit/request-context";
import { VerificationError } from "./verification.error";
import * as repo from "./verification.repo";
import {
  normalizeTarget,
  type VerificationChannel,
} from "./verification.schema";
import { sendVerification } from "./verification.sender";

/**
 * 이메일·전화번호 확인. **`recordAudit`을 하나도 남기지 않는 유일한 모듈이다.**
 * 그 대가로 발송 남용이 감사로그에 안 보인다 — 아래 횟수 제한이 막을 뿐이다.
 */

/** 실물은 verification.error.ts에 하나뿐이다. 기존 import 경로를 지키려고 다시 낸다. */
export { VerificationError };

/** 코드 유효시간 */
const TTL_MINUTES = 5;
/** 코드 대조 실패 허용 횟수 */
const MAX_ATTEMPTS = 5;
/** 같은 대상에 한 시간 동안 보낼 수 있는 횟수 */
const MAX_SENDS_PER_HOUR = 5;
/**
 * 같은 IP에서 한 시간 동안 보낼 수 있는 횟수 (I4) — 대상을 바꿔 가며 우회하는
 * 것을 막는다. 교내망에서 여러 학생이 동시에 가입할 수 있어 넉넉하게 잡는다.
 */
const MAX_SENDS_PER_HOUR_PER_IP = 20;
/** 확인 후 이 시간 안에 가입을 마쳐야 한다 */
const VERIFIED_TTL_MINUTES = 30;

/**
 * 목업 모드 — 발송한 코드를 화면에 채워 준다. 코드를 클라이언트로 돌려주면
 * 인증이 무의미해지므로, 개발 빌드에서 플래그를 명시했을 때만 켜진다.
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

/**
 * 인증코드 발송. 같은 대상의 이전 코드는 무효가 된다.
 * 초대코드 검사는 registration.service.ts가 먼저 태운다 (I4) — 여기는 횟수만 본다.
 */
export async function requestCode(
  channel: VerificationChannel,
  rawTarget: string,
): Promise<{ mockCode?: string }> {
  const target = normalizeTarget(channel, rawTarget);
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 60_000);

  const recent = await repo.countRecentSends(channel, target, since);
  if (recent >= MAX_SENDS_PER_HOUR) {
    throw new VerificationError(
      "인증번호를 너무 많이 요청했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const { ip } = await readRequestContext();
  // ip를 못 읽으면 이 검사를 건너뛴다 — null을 한 버킷으로 묶으면 서로 다른
  // 요청들이 남의 한도를 갉아먹는다.
  if (ip) {
    const recentByIp = await repo.countRecentSendsByIp(ip, since);
    if (recentByIp >= MAX_SENDS_PER_HOUR_PER_IP) {
      throw new VerificationError(
        "인증번호를 너무 많이 요청했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  await repo.expirePending(channel, target, now);

  // 0으로 시작하는 코드도 나오므로 6자리로 채운다.
  const code = randomInt(1_000_000).toString().padStart(6, "0");

  const row = await repo.insertCode({
    channel,
    target,
    codeHash: hash(code),
    expiresAt: minutesFromNow(TTL_MINUTES, now),
    requestIp: ip,
  });

  if (isMockVerification()) {
    // 목업에서는 발송을 건너뛴다.
    console.log(`[인증코드·목업] ${channel} ${target} : ${code}`);
    return { mockCode: code };
  }

  try {
    await sendVerification({ channel, target, code });
  } catch (error) {
    // 발송이 실패했으면 이 코드는 무의미하다. 지워서 한도를 갉아먹지 않게 한다.
    await repo.deleteById(row.id);

    // 공급자 오류 원문에는 키·계정 정보가 섞여 있다. 서버에만 남긴다.
    console.error("[인증코드] 발송 실패", error);
    throw new VerificationError(
      "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  return {};
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

/** 가입 시점에 부른다. 클라이언트의 "인증했다" 주장을 믿지 않고 DB로 확인한다. */
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

/** 가입이 끝나면 쓴 코드를 소진 처리한다. */
export async function consumeVerifications(ids: string[]): Promise<void> {
  await repo.consume(ids, new Date());
}
