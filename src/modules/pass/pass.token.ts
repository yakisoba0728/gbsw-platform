import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * 학생증 QR의 코드. **DB는 모르고 시계는 인자로 받는다** — 순수 함수라 테스트가
 * 시간을 직접 쥔다. 이 코드가 무엇을 뜻하는지는 verify.service가 정한다.
 *
 * 코드가 붙는 곳은 학생 프로필이고(출입증 한 건이 아니다), **20초마다 갈린다.**
 * 둘을 함께 두는 이유가 있다 —
 *
 *   프로필에 붙이므로: 승인된 것이 없어도 학생증은 있고, 정문에서 찍으면 그
 *                    자리에서 「이 학생이 지금 나가도 되는가」가 판정된다.
 *   20초마다 갈리므로: 화면을 찍어 둔 사진이 다음 창에서 못 쓴다.
 */

/** 코드가 바뀌는 주기(초). 화면에 뜬 값은 20~40초 유효하다. */
export const STEP_SECONDS = 20;

/** 서명 길이(바이트). 12바이트 = 96비트 → base64url 16글자. */
const SIG_BYTES = 12;

const PROFILE_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;

/**
 * 서명 키. 새 환경변수를 만들지 않고 BETTER_AUTH_SECRET에서 파생한다 —
 * 이 값이 새는 경로는 그 값이 새는 경로와 같고(같은 프로세스의 환경변수),
 * 따로 두면 관리 지점만 하나 는다.
 *
 * info의 `v2`는 학생증이 고정 코드였던 짧은 기간과 갈라 두려는 것이다. 회전이
 * 필요하면 `v3`으로 올린다 — 그 시각 이후 모든 학생증이 갈린다.
 */
function signingKey(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) {
    throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  }
  return Buffer.from(hkdfSync("sha256", base, "", "gbsw-student-qr-v2", 32));
}

function sign(studentProfileId: string, step: number): string {
  return createHmac("sha256", signingKey())
    .update(`${studentProfileId}:${step}`)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString("base64url");
}

function stepAt(at: Date): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

export function issueStudentCode(
  studentProfileId: string,
  at: Date,
): { code: string; validUntil: Date } {
  const step = stepAt(at);
  return {
    code: `${studentProfileId}.${sign(studentProfileId, step)}`,
    validUntil: new Date((step + 1) * STEP_SECONDS * 1000),
  };
}

export type CodeResult = { studentProfileId: string } | "STALE" | "MALFORMED";

/**
 * 세 갈래인 이유는 화면 문구가 갈리기 때문이다. `STALE`은 「형식은 맞는데
 * 서명이 이 창의 것이 아니다」일 뿐이고, 그 학생이 실재하는지는 서비스가 본다.
 *
 * 미래 스텝은 받지 않는다 — 창이 60초로 늘어나는데 얻는 것은 서버 시계가
 * 검증자 쪽보다 빠를 때뿐이고, 둘 다 같은 서버 시계다.
 */
export function verifyStudentCode(code: string, at: Date): CodeResult {
  const dot = code.indexOf(".");
  if (dot <= 0) return "MALFORMED";

  const studentProfileId = code.slice(0, dot);
  const signature = code.slice(dot + 1);
  if (!PROFILE_ID.test(studentProfileId) || !SIGNATURE.test(signature)) {
    return "MALFORMED";
  }

  const step = stepAt(at);
  for (const candidate of [step, step - 1]) {
    if (constantTimeEquals(signature, sign(studentProfileId, candidate))) {
      return { studentProfileId };
    }
  }
  return "STALE";
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
