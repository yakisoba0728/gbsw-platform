import { createAligoSender, readAligoConfig } from "./senders/aligo";
import type { VerificationChannel } from "./verification.schema";

/**
 * 인증코드 발송기.
 *
 *   PHONE  알리고(Aligo) 문자. SMS_* 환경변수가 있으면 실제로 보낸다.
 *   EMAIL  아직 발송 수단이 정해지지 않아 콘솔에만 찍는다 (SMTP 미결정).
 *
 * 환경변수가 없으면 어느 채널이든 콘솔로 떨어진다 — 개발 중에는 그게 기본이다.
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

/** 개발용 — 발송 대신 콘솔에 찍는다. */
export const consoleSender: VerificationSender = async ({
  channel,
  target,
  code,
}) => {
  console.log(
    `[인증코드] ${CHANNEL_LABEL[channel]} → ${target} : ${code} (5분 유효)`,
  );
};

const aligoConfig = readAligoConfig();
const smsSender = aligoConfig ? createAligoSender(aligoConfig) : consoleSender;

export const sendVerification: VerificationSender = async (input) => {
  if (input.channel === "PHONE") return smsSender(input);
  return consoleSender(input);
};

/** 기동 로그용 — 지금 어떤 발송 경로가 잡혀 있는지. */
export function describeSenders(): string {
  const sms = aligoConfig
    ? `알리고(${aligoConfig.sender}${aligoConfig.testMode ? ", 테스트모드" : ""})`
    : "콘솔";
  return `문자=${sms} / 이메일=콘솔`;
}
