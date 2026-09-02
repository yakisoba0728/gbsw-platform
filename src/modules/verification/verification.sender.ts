import { createAligoSender, maskPhone, readAligoConfig } from "./senders/aligo";
import { createSmtpSender, readSmtpConfig } from "./senders/smtp";
import type { VerificationChannel } from "./verification.schema";

export type VerificationSender = (input: {
  channel: VerificationChannel;
  target: string;
  code: string;
}) => Promise<void>;

const CHANNEL_LABEL: Record<VerificationChannel, string> = {
  EMAIL: "이메일",
  PHONE: "문자",
};

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`;
}

export function maskVerificationTarget(
  channel: VerificationChannel,
  target: string,
): string {
  return channel === "PHONE" ? maskPhone(target) : maskEmail(target);
}

export const consoleSender: VerificationSender = async ({
  channel,
  target,
}) => {
  console.log(
    `[인증코드] ${CHANNEL_LABEL[channel]} → ${maskVerificationTarget(channel, target)} 발송 (콘솔, 5분 유효)`,
  );
};

const aligoConfig = readAligoConfig();
const smtpConfig = readSmtpConfig();

const emailSender: VerificationSender = async (input) => {
  if (smtpConfig) return createSmtpSender(smtpConfig)(input);
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "이메일 인증코드 발송 수단이 설정되지 않았습니다.",
    );
  }
  return consoleSender(input);
};

const smsSender: VerificationSender = async (input) => {
  if (aligoConfig) return createAligoSender(aligoConfig)(input);
  if (process.env.NODE_ENV === "production") {
    throw new Error("문자 인증코드 발송 수단이 설정되지 않았습니다.");
  }
  return consoleSender(input);
};

export const sendVerification: VerificationSender = async (input) => {
  if (input.channel === "PHONE") return smsSender(input);
  return emailSender(input);
};

export function describeSenders(): string {
  const sms = aligoConfig
    ? `알리고(${aligoConfig.sender}${aligoConfig.testMode ? ", 테스트모드" : ""})`
    : process.env.NODE_ENV === "production"
      ? "미설정(요청 시 실패)"
      : "콘솔";
  const email = smtpConfig
    ? `SMTP(${smtpConfig.host}:${smtpConfig.port})`
    : process.env.NODE_ENV === "production"
      ? "미설정(요청 시 실패)"
      : "콘솔";
  return `문자=${sms} / 이메일=${email}`;
}
