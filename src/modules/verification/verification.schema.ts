import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";

export const VERIFICATION_CHANNELS = ["EMAIL", "PHONE"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export const channelSchema = z.enum(VERIFICATION_CHANNELS);

/**
 * 이메일은 소문자로, 전화번호는 하이픈 표기로 통일해 저장·대조한다.
 *
 * user-fields.ts의 emailField·phoneField를 그대로 쓴다 (M5) — 여기서 따로
 * 정규식·정규화를 복제해 두면 한쪽만 바뀌었을 때 requireVerified가 가입 입력과
 * 다른 문자열을 찾게 되어 가입이 통째로 막힌다.
 */
export const emailTargetSchema = emailField;
export const phoneTargetSchema = phoneField;

export function normalizeTarget(
  channel: VerificationChannel,
  raw: string,
): string {
  const parsed =
    channel === "EMAIL"
      ? emailTargetSchema.safeParse(raw)
      : phoneTargetSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "형식이 올바르지 않습니다.");
  }
  return parsed.data;
}

export const requestCodeSchema = z.object({
  channel: channelSchema,
  target: z.string().min(1),
});

export const confirmCodeSchema = z.object({
  channel: channelSchema,
  target: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력하세요."),
});
