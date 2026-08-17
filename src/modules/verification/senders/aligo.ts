import type { VerificationSender } from "../verification.sender";

/**
 * 알리고 문자 발송. 인증값은 전부 환경변수에서 읽는다.
 * 발신번호는 알리고에 사전 등록된 번호여야 한다 (전기통신사업법상 필수).
 */

const ENDPOINT = "https://apis.aligo.in/send_mass/";
const TIMEOUT_MS = 10_000;

export type AligoConfig = {
  key: string;
  userId: string;
  /** 사전 등록된 발신번호 */
  sender: string;
  /** 요청은 처리되지만 발송도 과금도 되지 않는다. 운영에서는 꺼야 한다. */
  testMode: boolean;
};

export class AligoError extends Error {}

/** 환경변수가 다 갖춰졌을 때만 설정을 돌려준다. 하나라도 없으면 null. */
export function readAligoConfig(
  env: Record<string, string | undefined> = process.env,
): AligoConfig | null {
  const key = env.SMS_KEY?.trim();
  const userId = env.SMS_USER_ID?.trim();
  const sender = env.SMS_SENDER?.trim();

  if (!key || !userId || !sender) return null;

  return { key, userId, sender, testMode: env.SMS_TEST_MODE === "true" };
}

/** 알리고는 하이픈 없는 숫자만 받는다. */
export function toAligoNumber(phone: string): string {
  return phone.replaceAll(/\D/g, "");
}

/** 로그에 남길 때 가운데를 가린다. */
export function maskPhone(phone: string): string {
  const d = toAligoNumber(phone);
  if (d.length < 7) return "***";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export function buildAligoBody(
  config: AligoConfig,
  to: string,
  message: string,
): URLSearchParams {
  const body = new URLSearchParams({
    key: config.key,
    user_id: config.userId,
    sender: config.sender,
    cnt: "1",
    // 인증번호는 짧아서 SMS(90바이트)에 들어간다. LMS보다 저렴하다.
    msg_type: "SMS",
    rec_1: toAligoNumber(to),
    msg_1: message,
  });

  if (config.testMode) body.set("testmode_yn", "Y");

  return body;
}

type AligoResponse = {
  result_code?: string | number;
  message?: string;
  success_cnt?: number;
  error_cnt?: number;
  msg_id?: string;
};

/** 접수 성공 판정. 발송 실패를 사용자에게 알려야 하므로 실패면 던진다. */
export function assertAligoSuccess(payload: AligoResponse): string | undefined {
  const code = String(payload.result_code ?? "");
  const ok =
    code === "1" && payload.success_cnt === 1 && (payload.error_cnt ?? 0) === 0;

  if (!ok) {
    throw new AligoError(
      `알리고 발송 실패 (result_code=${code}, message=${payload.message ?? "-"})`,
    );
  }
  return payload.msg_id;
}

export function createAligoSender(config: AligoConfig): VerificationSender {
  return async ({ channel, target, code }) => {
    if (channel !== "PHONE") {
      throw new AligoError("알리고는 문자 발송에만 쓴다.");
    }

    const message = `[경북소프트웨어마이스터고] 인증번호 ${code}\n5분 안에 입력해 주세요.`;

    let payload: AligoResponse;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildAligoBody(config, target, message),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new AligoError(`알리고 응답 오류 (HTTP ${response.status})`);
      }
      payload = (await response.json()) as AligoResponse;
    } catch (error) {
      if (error instanceof AligoError) throw error;
      throw new AligoError(
        `알리고 호출 실패: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }

    const msgId = assertAligoSuccess(payload);

    // 수신번호는 가리고, 코드는 절대 남기지 않는다.
    console.log(
      `[SMS] ${maskPhone(target)} 발송 접수${config.testMode ? " (테스트모드)" : ""}` +
        (msgId ? ` msg_id=${msgId}` : ""),
    );
  };
}
