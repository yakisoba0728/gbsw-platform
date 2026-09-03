import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";
import { VerificationError } from "./verification.error";

const VERIFICATION_CHANNELS = ["EMAIL", "PHONE"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export const channelSchema = z.enum(VERIFICATION_CHANNELS);

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

/* 발급 응답으로만 나가는 불투명한 손잡이. 대상값과 달리 남이 알 수 없다. */
export const challengeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22,64}$/, "인증 요청을 다시 시작해 주세요.");

export const confirmCodeSchema = z.object({
  challengeId: challengeIdSchema,
  code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력해 주세요."),
});
