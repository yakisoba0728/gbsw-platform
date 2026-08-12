import { z } from "zod";

const phone = z
  .string()
  .trim()
  .regex(/^01[016-9][-\s]?\d{3,4}[-\s]?\d{4}$/, "휴대폰 번호 형식이 올바르지 않습니다.")
  .transform((value) => {
    const d = value.replaceAll(/\D/g, "");
    return d.length === 11
      ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
      : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  });

/**
 * 관리자가 고칠 수 있는 항목.
 *
 * 이메일은 로그인 아이디라 두고, 역할도 여기서 바꾸지 않는다
 * (권한이 통째로 넘어가는 변경이라 별도 절차가 필요하다).
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50, "이름이 너무 깁니다."),
  phone: phone.optional().or(z.literal("")),

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
