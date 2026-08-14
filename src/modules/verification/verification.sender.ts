import { createAligoSender, maskPhone, readAligoConfig } from "./senders/aligo";
import type { VerificationChannel } from "./verification.schema";

/**
 * 인증코드 발송기.
 *
 *   PHONE  알리고(Aligo) 문자. SMS_* 환경변수가 있으면 실제로 보낸다.
 *   EMAIL  아직 발송 수단이 정해지지 않아 콘솔에만 찍는다 (SMTP 미결정).
 *
 * 환경변수가 없으면 어느 채널이든 콘솔로 떨어진다 — 개발 중에는 그게 기본이다.
 * 단, 운영에서 EMAIL로 떨어지는 것만은 막는다. describeSenders() 설명 참고.
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

/** `ab12cd@gbsw.hs.kr` → `ab***@gbsw.hs.kr`. 로그·감사 기록에 남길 때 가운데를 가린다. */
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

/**
 * 발송 수단이 없을 때 대신 콘솔에 찍는다.
 *
 * 코드는 절대 남기지 않는다 — 로그를 볼 수 있는 사람이 초대코드만 들고 있으면
 * 남의 신원으로 2차 인증을 통과할 수 있게 된다. 알리고 경로(senders/aligo.ts)와
 * 같은 원칙이다.
 */
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
 * 운영에서 EMAIL은 아직 보낼 수 있는 수단이 없다 — 조용히 콘솔로 흘려보내면
 * "가입이 되는 것처럼 보이지만 아무도 코드를 못 받는" 상태가 로그만 봐서는
 * 드러나지 않는다. 요청이 들어오는 즉시 던져서 배포 뒤 바로 드러나게 한다.
 *
 * 이메일 인증을 앞으로 어떻게 할지(SMTP 도입/제거/문자 대체)는 여기서 정하지 않는다 —
 * 조용한 실패를 시끄러운 실패로 바꾸는 데까지만 한다.
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
