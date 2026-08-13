import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";

export const bootstrapSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 입력하세요.").max(50, "이름이 너무 깁니다."),
    email: emailField,
    phone: phoneField,
    password: z
      .string()
      .min(10, "비밀번호는 10자 이상이어야 합니다.")
      .max(128, "비밀번호가 너무 깁니다."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "비밀번호가 서로 다릅니다.",
  });

export type BootstrapInput = z.infer<typeof bootstrapSchema>;
