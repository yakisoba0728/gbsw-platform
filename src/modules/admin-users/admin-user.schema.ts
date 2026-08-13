import { z } from "zod";
import { emailField, phoneField } from "@/lib/user-fields";

/**
 * 관리자가 고칠 수 있는 항목.
 *
 * 이메일과 전화번호는 필수다 — 비울 수 없고, 오타는 여기서 고친다.
 * 이메일은 로그인 아이디이기도 하므로 바꾸면 다음 로그인부터 새 주소를 쓴다.
 * 역할은 여전히 제외한다 (권한이 통째로 넘어가는 변경이라 별도 절차가 필요하다).
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50, "이름이 너무 깁니다."),
  email: emailField,
  phone: phoneField,

  // 아래는 학생일 때만 쓴다.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일 형식이 올바르지 않습니다.")
    .optional()
    .or(z.literal("")),
  grade: z.coerce.number().int().min(1).max(3).optional(),
  classNo: z.coerce.number().int().min(1).max(20).optional(),
  number: z.coerce.number().int().min(1).max(50).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
