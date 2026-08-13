import { z } from "zod";

/**
 * 계정 공통 입력 규칙.
 *
 * 이메일·전화번호는 가입 · 최초 관리자 생성 · 관리자 수정 세 경로에서 모두 받는다.
 * 각자 복사해두면 형식 규칙이나 정규화 방식이 바뀔 때 한 곳만 고쳐지고
 * 나머지가 조용히 어긋난다. 특히 표기가 어긋나면 인증 기록 대조와
 * 수정 화면의 변경 감지가 같이 틀어진다.
 */

/** 저장 표기를 010-0000-0000으로 통일한다. */
export function normalizePhone(value: string): string {
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
  .min(1, "이메일을 입력하세요.")
  .max(200)
  .refine(
    (v) => z.email().safeParse(v).success,
    "이메일 형식이 올바르지 않습니다.",
  )
  // 인증 기록·로그인 조회와 같은 표기로 맞춘다.
  .transform((v) => v.toLowerCase());
