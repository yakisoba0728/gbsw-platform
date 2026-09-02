import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/* 20초마다 갱신하며 현재·직전 구간을 허용해 20~40초 유효하다. */
export const STEP_SECONDS = 20;

const SIG_BYTES = 12;

const PROFILE_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;

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
    code: `${studentProfileId}.${sign(studentProfileId, step)}`,
    validUntil: new Date((step + 1) * STEP_SECONDS * 1000),
  };
}

type CodeResult = { studentProfileId: string } | "STALE" | "MALFORMED";

/* 현재·직전 구간만 허용한다. STALE의 학생 존재 여부는 서비스에서 확인한다. */
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
