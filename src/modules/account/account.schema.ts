import { z } from "zod";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요."),
    newPassword: z
      .string()
      .min(10, "새 비밀번호는 10자 이상이어야 합니다.")
      .max(128, "새 비밀번호가 너무 깁니다."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "새 비밀번호가 서로 다릅니다.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "현재 비밀번호와 다른 비밀번호를 사용하세요.",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
