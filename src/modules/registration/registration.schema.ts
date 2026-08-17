import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";

export const inviteCodeSchema = z
  .string()
  .trim()
  .min(1, "가입코드를 입력해 주세요.")
  .max(32);

const credentials = {
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요.")
    .max(50, "이름이 너무 깁니다."),
  email: emailField,
  phone: phoneField,
  password: z
    .string()
    .min(10, "비밀번호는 10자 이상이어야 합니다.")
    .max(128, "비밀번호가 너무 깁니다."),
  confirmPassword: z.string(),
};

/** 역할은 여기 없다 — 서버가 코드 레코드에서만 읽는다. birthDate는 학생만 채운다. */
export const completeRegistrationSchema = z
  .object({
    code: inviteCodeSchema,
    ...credentials,
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.")
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
