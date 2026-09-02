import type { VerificationSender } from "../verification.sender";

const ENDPOINT = "https://apis.aligo.in/send_mass/";
const TIMEOUT_MS = 10_000;

export type AligoConfig = {
  key: string;
  userId: string;
  sender: string;
  testMode: boolean;
};

export class AligoError extends Error {}

export function readAligoConfig(
  env: Record<string, string | undefined> = process.env,
): AligoConfig | null {
  const key = env.SMS_KEY?.trim();
  const userId = env.SMS_USER_ID?.trim();
  const sender = env.SMS_SENDER?.trim();

  if (!key || !userId || !sender) return null;

  return { key, userId, sender, testMode: env.SMS_TEST_MODE === "true" };
}

export function toAligoNumber(phone: string): string {
  return phone.replaceAll(/\D/g, "");
}

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

    console.log(
      `[SMS] ${maskPhone(target)} 발송 접수${config.testMode ? " (테스트모드)" : ""}` +
        (msgId ? ` msg_id=${msgId}` : ""),
    );
  };
}
