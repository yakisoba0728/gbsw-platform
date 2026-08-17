import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";
import { VerificationError } from "./verification.error";

export const VERIFICATION_CHANNELS = ["EMAIL", "PHONE"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export const channelSchema = z.enum(VERIFICATION_CHANNELS);

/**
 * user-fields.ts의 필드를 그대로 쓴다 (M5) — 정규화를 복제하면 requireVerified가
 * 가입 입력과 다른 문자열을 찾게 되어 가입이 막힌다.
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
    // VerificationError를 던진다 — 호출부가 instanceof로 가리므로 익명 Error면
    // 여기 한글 문구가 일반 폴백에 덮인다.
    throw new VerificationError(
      parsed.error.issues[0]?.message ?? "형식이 올바르지 않습니다.",
    );
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
  code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력해 주세요."),
});
