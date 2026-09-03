import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { VerificationChannel } from "./verification.schema";

/*
 * 인증코드는 6자리라 후보가 10^6뿐이다. 비밀키 없는 해시로 저장하면
 * VerificationCode.codeHash 한 줄만 읽혀도 전수대입이 그 자리에서 끝나므로,
 * 서버 비밀 없이는 후보를 대조조차 못 하게 키 있는 HMAC으로 저장한다.
 *
 * HKDF info 버전을 바꾸면 저장돼 있던 코드 해시가 전부 무효가 된다.
 * BETTER_AUTH_SECRET을 회전해도 마찬가지다 — 그 순간 살아 있던 인증번호는
 * 확인에 실패하고 사용자는 다시 요청하면 된다(수명이 5분이라 실질 영향은 작다).
 * v1: 비밀키 없는 SHA-256 저장을 끝낸다. 이 배포 시점의 미확인 코드는 모두 무효다.
 *
 * info는 학생증 QR(gbsw-student-qr-v3)과 반드시 달라야 한다 — 같은 문자열을
 * 쓰면 두 용도가 한 키를 나눠 쓰게 된다.
 */
const HKDF_INFO = "gbsw-verification-code-v1";

function hashingKey(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) {
    // VerificationError가 아니라 평범한 Error를 던진다. 가입 화면은
    // VerificationError의 message를 그대로 보여주므로(로그인 이전 화면의 오류
    // 규약) 서버 설정 상태를 방문자에게 적어 보내게 된다. 평범한 Error는
    // 가입 액션의 일반 분기가 받아 서버 로그에만 남기고 화면에는 정해진 문구만
    // 내보낸다. 비밀이 없으면 코드를 발급하지도, 대조하지도 않는다.
    throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  }
  return Buffer.from(hkdfSync("sha256", base, "", HKDF_INFO, 32));
}

/*
 * 코드만이 아니라 채널·대상까지 묶어 서명한다 — 해시가 그 행에서만 유효해져
 * 다른 행의 해시를 옮겨 심는 방법이 통하지 않는다. target은 정규화된 값이다.
 */
export function hashVerificationCode(
  channel: VerificationChannel,
  target: string,
  code: string,
): string {
  return createHmac("sha256", hashingKey())
    .update(`${channel}:${target}:${code}`)
    .digest("hex");
}

export function verificationCodeMatches(
  expectedHash: string,
  channel: VerificationChannel,
  target: string,
  code: string,
): boolean {
  const a = Buffer.from(expectedHash);
  const b = Buffer.from(hashVerificationCode(channel, target, code));
  return a.length === b.length && timingSafeEqual(a, b);
}
