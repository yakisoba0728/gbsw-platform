import { createAligoSender, maskPhone, readAligoConfig } from "./senders/aligo";
import type { VerificationChannel } from "./verification.schema";

/**
 * 인증코드 발송기. PHONE은 알리고, EMAIL은 아직 수단이 없어 콘솔로 떨어진다.
 * 단, 운영에서 EMAIL로 떨어지는 것만은 막는다 (emailSender 참고).
 */
export type VerificationSender = (input: {
  channel: VerificationChannel;
  target: string;
  code: string;
}) => Promise<void>;

const CHANNEL_LABEL: Record<VerificationChannel, string> = {
  EMAIL: "이메일",
  PHONE: "문자",
};

/** `ab12cd@gbsw.hs.kr` → `ab***@gbsw.hs.kr`. 로그에 남길 때 가운데를 가린다. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`;
}

function maskTarget(channel: VerificationChannel, target: string): string {
  return channel === "PHONE" ? maskPhone(target) : maskEmail(target);
}

/** 발송 수단이 없을 때 콘솔에 찍는다. 코드는 절대 남기지 않는다. */
export const consoleSender: VerificationSender = async ({
  channel,
  target,
}) => {
  console.log(
    `[인증코드] ${CHANNEL_LABEL[channel]} → ${maskTarget(channel, target)} 발송 (콘솔, 5분 유효)`,
  );
};

const aligoConfig = readAligoConfig();
const smsSender = aligoConfig ? createAligoSender(aligoConfig) : consoleSender;

/**
 * 운영의 EMAIL은 보낼 수단이 없다. 콘솔로 흘려보내면 "가입은 되는데 아무도 코드를
 * 못 받는" 상태가 드러나지 않으므로, 요청이 들어오는 즉시 던진다.
 */
const emailSender: VerificationSender = async (input) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "이메일 인증코드 발송 수단이 설정되지 않았습니다 (운영에서 EMAIL 채널 미지원 — SMTP 미결정).",
    );
  }
  return consoleSender(input);
};

export const sendVerification: VerificationSender = async (input) => {
  if (input.channel === "PHONE") return smsSender(input);
  return emailSender(input);
};

/** 기동 로그용 — 지금 어떤 발송 경로가 잡혀 있는지. */
export function describeSenders(): string {
  const sms = aligoConfig
    ? `알리고(${aligoConfig.sender}${aligoConfig.testMode ? ", 테스트모드" : ""})`
    : "콘솔";
  const email =
    process.env.NODE_ENV === "production" ? "미설정(요청 시 실패)" : "콘솔";
  return `문자=${sms} / 이메일=${email}`;
}
