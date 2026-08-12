import { z } from "zod";

export const VERIFICATION_CHANNELS = ["EMAIL", "PHONE"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export const channelSchema = z.enum(VERIFICATION_CHANNELS);

/** 이메일은 소문자로, 전화번호는 하이픈 표기로 통일해 저장·대조한다. */
export const emailTargetSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => z.email().safeParse(v).success,
    "이메일 형식이 올바르지 않습니다.",
  )
  .transform((v) => v.toLowerCase());

export const phoneTargetSchema = z
  .string()
  .trim()
  .regex(/^01[016-9][-\s]?\d{3,4}[-\s]?\d{4}$/, "휴대폰 번호 형식이 올바르지 않습니다.")
  .transform((value) => {
    const d = value.replaceAll(/\D/g, "");
    return d.length === 11
      ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
      : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  });

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
