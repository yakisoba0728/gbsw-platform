import { z } from "zod";

/**
 * 계정 공통 입력 규칙. 표기가 경로마다 어긋나면 인증 기록 대조가 틀어진다.
 * normalizePhone은 내보내지 않는다 — 검증을 건너뛴 정규화가 생기지 않게.
 */
function normalizePhone(value: string): string {
  const d = value.replaceAll(/\D/g, "");
  return d.length === 11
    ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
    : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export const phoneField = z
  .string()
  .trim()
  .regex(
    /^01[016-9][-\s]?\d{3,4}[-\s]?\d{4}$/,
    "휴대폰 번호 형식이 올바르지 않습니다.",
  )
  .transform(normalizePhone);

export const emailField = z
  .string()
  .trim()
  .min(1, "이메일을 입력해 주세요.")
  .max(200)
  .refine(
    (v) => z.email().safeParse(v).success,
    "이메일 형식이 올바르지 않습니다.",
  )
  // 인증 기록·로그인 조회와 같은 표기로 맞춘다.
  .transform((v) => v.toLowerCase());
