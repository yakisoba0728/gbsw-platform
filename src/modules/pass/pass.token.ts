import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/* 20초마다 갱신하며 현재·직전 구간을 허용해 20~40초 유효하다. */
export const STEP_SECONDS = 20;

const SIG_BYTES = 12;

const PROFILE_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;
const TOKEN_STEP = /^(0|[1-9][0-9]{0,15})$/;

/* HKDF info 버전을 바꾸면 기존 학생 QR이 모두 무효화된다. */
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
    code: `${studentProfileId}.${step}.${sign(studentProfileId, step)}`,
    validUntil: new Date((step + 1) * STEP_SECONDS * 1000),
  };
}

type CodeResult =
  | { studentProfileId: string; stale?: true }
  | "STALE"
  | "INVALID"
  | "MALFORMED";

/* 현재·직전 구간만 허용하고, 서명된 스텝으로 진짜 지난 코드만 식별한다. */
export function verifyStudentCode(code: string, at: Date): CodeResult {
  const [studentProfileId, stepOrSignature, signature, extra] = code.split(".");
  if (!studentProfileId || !stepOrSignature || extra !== undefined) {
    return "MALFORMED";
  }

  if (!PROFILE_ID.test(studentProfileId)) {
    return "MALFORMED";
  }

  const step = stepAt(at);

  // 배포 직전 형식(id.signature)은 현재·직전 서명만 인증해 잠깐 호환한다.
  // 그보다 오래된 legacy 코드는 스텝을 품지 않아 진위를 가릴 수 없다.
  if (signature === undefined) {
    if (!SIGNATURE.test(stepOrSignature)) return "MALFORMED";
    for (const candidate of [step, step - 1]) {
      if (
        constantTimeEquals(stepOrSignature, sign(studentProfileId, candidate))
      ) {
        return { studentProfileId };
      }
    }
    return "STALE";
  }

  if (!TOKEN_STEP.test(stepOrSignature) || !SIGNATURE.test(signature)) {
    return "MALFORMED";
  }

  const signedStep = Number(stepOrSignature);
  if (!Number.isSafeInteger(signedStep)) return "MALFORMED";
  if (!constantTimeEquals(signature, sign(studentProfileId, signedStep))) {
    return "INVALID";
  }

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
