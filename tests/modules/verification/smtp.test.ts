import { describe, expect, it, vi } from "vitest";
import {
  createSmtpSender,
  readSmtpConfig,
  SmtpConfigError,
} from "@/modules/verification/senders/smtp";

describe("readSmtpConfig()", () => {
  it("설정이 전혀 없으면 미설정으로 본다", () => {
    expect(readSmtpConfig({})).toBeNull();
    expect(
      readSmtpConfig({
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_REQUIRE_TLS: "true",
      }),
    ).toBeNull();
  });

  it("STARTTLS SMTP 설정을 읽고 인증정보 쌍을 강제한다", () => {
    expect(
      readSmtpConfig({
        SMTP_HOST: "mail.example.test",
        SMTP_PORT: "587",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "secret",
        SMTP_FROM: "GBSW <no-reply@example.test>",
      }),
    ).toEqual({
      host: "mail.example.test",
      port: 587,
      secure: false,
      requireTls: true,
      user: "mailer",
      password: "secret",
      from: "GBSW <no-reply@example.test>",
    });

    expect(() =>
      readSmtpConfig({
        SMTP_HOST: "mail.example.test",
        SMTP_USER: "mailer",
        SMTP_FROM: "no-reply@example.test",
      }),
    ).toThrow(SmtpConfigError);
  });

  it("465 포트는 별도 플래그 없이 SMTPS 기본값을 쓴다", () => {
    expect(
      readSmtpConfig({
        SMTP_HOST: "mail.example.test",
        SMTP_PORT: "465",
        SMTP_FROM: "no-reply@example.test",
      }),
    ).toMatchObject({ port: 465, secure: true, requireTls: false });
  });
});

describe("createSmtpSender()", () => {
  it("인증번호와 만료 안내를 실제 메일 전달 함수에 넘긴다", async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const config = readSmtpConfig({
      SMTP_HOST: "mail.example.test",
      SMTP_FROM: "no-reply@example.test",
    })!;

    await createSmtpSender(config, deliver)({
      target: "student@example.test",
      code: "654321",
    });

    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "no-reply@example.test",
        to: "student@example.test",
        subject: expect.stringContaining("가입 인증번호"),
        text: expect.stringContaining("654321"),
      }),
    );
  });
});
