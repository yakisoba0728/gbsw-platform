export const LOGIN_DISABLED_MESSAGE =
  "사용이 중지된 계정입니다. 선생님께 문의해 주세요.";

export const LOGIN_EMAIL_HINT_COOKIE = "gbsw.login-email-hint";

export const LOGIN_ERROR_MESSAGES = {
  credentials: "이메일 또는 비밀번호가 맞지 않습니다.",
  disabled: LOGIN_DISABLED_MESSAGE,
  invalid: "이메일과 비밀번호를 입력해 주세요.",
  rateLimited: "시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  server: "로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES;

export function loginErrorMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!Object.hasOwn(LOGIN_ERROR_MESSAGES, value)) return null;
  return LOGIN_ERROR_MESSAGES[value as LoginErrorCode];
}
