import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * QR 토큰. **DB도 시계도 모른다** — `at`을 인자로 받는 순수 함수라 테스트가
 * 시간을 직접 쥔다. 판정이 이 결과를 어떻게 옮기는지는 verify.service에 있다.
 */

/** 토큰이 바뀌는 주기(초). 화면에 뜬 값은 20~40초 유효하다. */
export const STEP_SECONDS = 20;

/** 서명 길이(바이트). 12바이트 = 96비트 → base64url 16글자. */
const SIG_BYTES = 12;

const PASS_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;

/**
 * 서명 키. 새 환경변수를 만들지 않고 BETTER_AUTH_SECRET에서 파생한다 —
 * 이 값이 새는 경로는 그 값이 새는 경로와 같고(같은 프로세스의 환경변수),
 * 따로 두면 관리 지점만 하나 는다. info의 v1을 v2로 바꾸면 그 시각 이후
 * 모든 토큰이 갈린다.
 */
function signingKey(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) {
    throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  }
  return Buffer.from(hkdfSync("sha256", base, "", "gbsw-pass-qr-v1", 32));
}

function sign(passId: string, step: number): string {
  return createHmac("sha256", signingKey())
    .update(`${passId}:${step}`)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString("base64url");
}

function stepAt(at: Date): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

export function issueToken(
  passId: string,
  at: Date,
): { token: string; validUntil: Date } {
  const step = stepAt(at);
  return {
    token: `${passId}.${sign(passId, step)}`,
    validUntil: new Date((step + 1) * STEP_SECONDS * 1000),
  };
}

export type TokenResult = { passId: string } | "STALE" | "MALFORMED";

/**
 * 세 갈래인 이유는 화면 문구가 갈리기 때문이다. `STALE`은 「형식은 맞는데
 * 서명이 이 창의 것이 아니다」일 뿐이고, 그 passId가 실재하는지는 서비스가 본다.
 *
 * 미래 스텝은 받지 않는다 — 창이 60초로 늘어나는데 얻는 것은 서버 시계가
 * 검증자 쪽보다 빠를 때뿐이고, 둘 다 같은 서버 시계다.
 */
export function verifyToken(token: string, at: Date): TokenResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return "MALFORMED";

  const passId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!PASS_ID.test(passId) || !SIGNATURE.test(signature)) return "MALFORMED";

  const step = stepAt(at);
  for (const candidate of [step, step - 1]) {
    if (constantTimeEquals(signature, sign(passId, candidate))) return { passId };
  }
  return "STALE";
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
