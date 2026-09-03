import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/* 20초마다 갱신하며 현재·직전 구간을 허용해 20~40초 유효하다. */
export const STEP_SECONDS = 20;

const SIG_BYTES = 12;

const PROFILE_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_STEP = /^(0|[1-9][0-9]{0,15})$/;

/*
 * HKDF info 버전을 바꾸면 기존 학생 QR이 모두 무효화된다.
 * v3: 스텝을 품지 않던 레거시 2-파트 형식(id.signature)의 수락을 끝내면서
 *     v2 서명으로 발급된 코드를 전부 거부한다 — 배포 시 학생증 QR을
 *     전면 재발급해야 한다.
 */
function signingKey(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) {
    throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  }
  return Buffer.from(hkdfSync("sha256", base, "", "gbsw-student-qr-v3", 32));
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
    code: `${studentProfileId}.${step}.${sign(studentProfileId, step)}`,
    validUntil: new Date((step + 1) * STEP_SECONDS * 1000),
  };
}

type CodeResult =
  | { studentProfileId: string; stale?: true }
  | "INVALID"
  | "MALFORMED";

/* 현재·직전 구간만 허용하고, 서명된 스텝으로 진짜 지난 코드만 식별한다. */
export function verifyStudentCode(code: string, at: Date): CodeResult {
  const [studentProfileId, stepText, signature, extra] = code.split(".");
  if (!studentProfileId || !stepText || !signature || extra !== undefined) {
    return "MALFORMED";
  }

  if (!PROFILE_ID.test(studentProfileId)) {
    return "MALFORMED";
  }

  // 스텝을 품지 않은 구형 형식(id.signature)은 시간 정보가 없어 유출된 QR을
  // 무기한 재사용할 수 있다 — 스텝이 없는 코드는 유효 기간과 무관하게 거부한다.
  if (!TOKEN_STEP.test(stepText) || !SIGNATURE.test(signature)) {
    return "MALFORMED";
  }

  const signedStep = Number(stepText);
  if (!Number.isSafeInteger(signedStep)) return "MALFORMED";
  if (!constantTimeEquals(signature, sign(studentProfileId, signedStep))) {
    return "INVALID";
  }

  const step = stepAt(at);
  for (const candidate of [step, step - 1]) {
    if (signedStep === candidate) {
      return { studentProfileId };
    }
  }
  return { studentProfileId, stale: true };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
