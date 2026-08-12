import { z } from "zod";

export const inviteCodeSchema = z
  .string()
  .trim()
  .min(1, "가입코드를 입력하세요.")
  .max(32);

const credentials = {
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력하세요.")
    .max(50, "이름이 너무 깁니다."),
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => z.email().safeParse(v).success,
      "이메일 형식이 올바르지 않습니다.",
    )
    // 인증 기록과 같은 표기로 맞춘다.
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^01[016-9][-\s]?\d{3,4}[-\s]?\d{4}$/, "휴대폰 번호 형식이 올바르지 않습니다.")
    // 저장 표기를 010-0000-0000으로 통일한다.
    .transform((value) => {
      const d = value.replaceAll(/\D/g, "");
      return d.length === 11
        ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
        : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    }),
  password: z
    .string()
    .min(10, "비밀번호는 10자 이상이어야 합니다.")
    .max(128, "비밀번호가 너무 깁니다."),
  confirmPassword: z.string(),
};

/**
 * 가입 입력.
 *
 * 역할은 여기에 없다 — 서버가 코드 레코드에서만 읽는다.
 * birthDate는 학생만 채우며, 나머지 역할에서는 무시된다.
 */
export const completeRegistrationSchema = z
  .object({
    code: inviteCodeSchema,
    ...credentials,
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식으로 입력하세요.")
      .optional()
      .or(z.literal("")),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "비밀번호가 서로 다릅니다.",
  });

export type CompleteRegistrationInput = z.infer<
  typeof completeRegistrationSchema
>;
