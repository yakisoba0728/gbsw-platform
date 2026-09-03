import { z } from "zod";
import { canonicalDateInputSchema } from "@/lib/date-input";
import {
  CLASS_NO_RANGE_MESSAGE,
  GRADE_RANGE_MESSAGE,
  MAX_CLASS_NO,
  MAX_GRADE,
  MAX_NUMBER,
  MIN_CLASS_NO,
  MIN_GRADE,
  MIN_NUMBER,
  NUMBER_RANGE_MESSAGE,
} from "@/modules/student/student-position";

const name = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(50, "이름이 너무 깁니다.");

const EXPIRY_RANGE_MESSAGE = "유효기간은 1~365일 사이의 정수여야 합니다.";

const expiresInDays = z
  .number(EXPIRY_RANGE_MESSAGE)
  .int(EXPIRY_RANGE_MESSAGE)
  .min(1, EXPIRY_RANGE_MESSAGE)
  .max(365, EXPIRY_RANGE_MESSAGE)
  .optional()
  .describe("비우면 무기한");

export const createStudentInviteSchema = z.object({
  name,
  birthDate: canonicalDateInputSchema(
    "생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.",
    "존재하지 않는 날짜입니다.",
  ),
  grade: z
    .number()
    .int(GRADE_RANGE_MESSAGE)
    .min(MIN_GRADE, GRADE_RANGE_MESSAGE)
    .max(MAX_GRADE, GRADE_RANGE_MESSAGE),
  classNo: z
    .number()
    .int(CLASS_NO_RANGE_MESSAGE)
    .min(MIN_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
    .max(MAX_CLASS_NO, CLASS_NO_RANGE_MESSAGE),
  number: z
    .number()
    .int(NUMBER_RANGE_MESSAGE)
    .min(MIN_NUMBER, NUMBER_RANGE_MESSAGE)
    .max(MAX_NUMBER, NUMBER_RANGE_MESSAGE),
  expiresInDays,
});

export const createAdminInviteSchema = z.object({
  name,
  expiresInDays,
});

export const createParentInviteSchema = z.object({
  name,
});

export const createParentInviteForSchema = z.object({
  studentId: z.string().min(1, "학생을 선택해 주세요."),
  name,
  expiresInDays,
});

export type CreateParentInviteForInput = z.infer<
  typeof createParentInviteForSchema
>;

export type CreateStudentInviteInput = z.infer<typeof createStudentInviteSchema>;
export type CreateAdminInviteInput = z.infer<typeof createAdminInviteSchema>;
export type CreateParentInviteInput = z.infer<typeof createParentInviteSchema>;

export const studentInviteMetaSchema = z.object({
  name: z.string(),
  birthDate: z.string(),
  grade: z.number().int(),
  classNo: z.number().int(),
  number: z.number().int(),
});

export const namedInviteMetaSchema = z.object({
  name: z.string(),
});

export const revokeInviteSchema = z.object({
  inviteId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "폐기 사유를 입력해 주세요.").max(500),
});

export type RevokeInviteInput = z.infer<typeof revokeInviteSchema>;
