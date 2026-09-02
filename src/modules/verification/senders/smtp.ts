import nodemailer from "nodemailer";

const DEFAULT_PORT = 587;
const TIMEOUT_MS = 10_000;

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string | null;
  password: string | null;
  from: string;
};

export class SmtpConfigError extends Error {}

function optional(env: Record<string, string | undefined>, key: string): string {
  return env[key]?.trim() ?? "";
}

function booleanValue(value: string, fallback: boolean): boolean {
  if (value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new SmtpConfigError("SMTP boolean 설정은 true 또는 false여야 합니다.");
}

export function readSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig | null {
  const host = optional(env, "SMTP_HOST");
  const from = optional(env, "SMTP_FROM");
  const user = optional(env, "SMTP_USER");
  const password = optional(env, "SMTP_PASSWORD");
  // compose의 PORT/TLS 기본값만으로 SMTP가 설정됐다고 오인하지 않는다.
  const configured = [host, from, user, password].some(Boolean);

  if (!configured) return null;
  if (!host || !from) {
    throw new SmtpConfigError("SMTP_HOST와 SMTP_FROM을 함께 설정해야 합니다.");
  }
  if (Boolean(user) !== Boolean(password)) {
    throw new SmtpConfigError("SMTP_USER와 SMTP_PASSWORD를 함께 설정해야 합니다.");
  }

  const rawPort = optional(env, "SMTP_PORT");
  const port = rawPort === "" ? DEFAULT_PORT : Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new SmtpConfigError("SMTP_PORT가 올바르지 않습니다.");
  }

  return {
    host,
    port,
    secure: booleanValue(optional(env, "SMTP_SECURE"), port === 465),
    requireTls: booleanValue(optional(env, "SMTP_REQUIRE_TLS"), port !== 465),
    user: user || null,
    password: password || null,
    from,
  };
}

type Mail = { from: string; to: string; subject: string; text: string };
type Deliver = (mail: Mail) => Promise<unknown>;

export function createSmtpSender(config: SmtpConfig, injectedDeliver?: Deliver) {
  const transport = injectedDeliver
    ? null
    : nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTls,
        auth:
          config.user && config.password
            ? { user: config.user, pass: config.password }
            : undefined,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      });
  const deliver: Deliver = injectedDeliver ?? ((mail) => transport!.sendMail(mail));

  return async ({ target, code }: { target: string; code: string }) => {
    await deliver({
      from: config.from,
      to: target,
      subject: "[경북소프트웨어마이스터고] 가입 인증번호",
      text: `가입 인증번호는 ${code}입니다.\n5분 안에 입력해 주세요.`,
    });
  };
}
