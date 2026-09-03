import { z } from "zod";
import { canonicalDateInputSchema } from "@/lib/date-input";
import { emailField, phoneField } from "@/lib/user-fields";
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

const USER_CHANGED_MESSAGE =
  "계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.";

export const updateUserSchema = z.object({
  updatedAt: z.iso.datetime(USER_CHANGED_MESSAGE).transform((value) => new Date(value)),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50, "이름이 너무 깁니다."),
  email: emailField,
  phone: phoneField,

  birthDate: canonicalDateInputSchema(
    "생년월일 형식이 올바르지 않습니다.",
    "존재하지 않는 생년월일입니다.",
  )
    .optional()
    .or(z.literal("")),
  grade: z.coerce
    .number(GRADE_RANGE_MESSAGE)
    .int(GRADE_RANGE_MESSAGE)
    .min(MIN_GRADE, GRADE_RANGE_MESSAGE)
    .max(MAX_GRADE, GRADE_RANGE_MESSAGE)
    .optional(),
  classNo: z.coerce
    .number(CLASS_NO_RANGE_MESSAGE)
    .int(CLASS_NO_RANGE_MESSAGE)
    .min(MIN_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
    .max(MAX_CLASS_NO, CLASS_NO_RANGE_MESSAGE)
    .optional(),
  number: z.coerce
    .number(NUMBER_RANGE_MESSAGE)
    .int(NUMBER_RANGE_MESSAGE)
    .min(MIN_NUMBER, NUMBER_RANGE_MESSAGE)
    .max(MAX_NUMBER, NUMBER_RANGE_MESSAGE)
    .optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const NOT_FOUND_MESSAGE = "계정을 찾을 수 없습니다.";
const userIdField = z.string(NOT_FOUND_MESSAGE).trim().min(1, NOT_FOUND_MESSAGE);

const auditReason = z
  .preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().max(200, "사유는 200자를 넘을 수 없습니다."),
  )
  .transform((v) => (v.length === 0 ? undefined : v));

export const userIdOnlySchema = z.object({
  userId: userIdField,
  reason: auditReason,
});

export const setUserActiveSchema = z.object({
  userId: userIdField,
  active: z
    .enum(["true", "false"], "계정 상태 값이 올바르지 않습니다.")
    .transform((value) => value === "true"),
  reason: auditReason,
});

const CONFIRM_NAME_MESSAGE = "확인을 위해 이름을 입력해 주세요.";

export const deleteUserSchema = z.object({
  userId: userIdField,
  confirmName: z
    .string(CONFIRM_NAME_MESSAGE)
    .trim()
    .min(1, CONFIRM_NAME_MESSAGE)
    .max(50, "이름이 너무 깁니다."),
});

export const updateUserFormSchema = updateUserSchema.extend({
  userId: userIdField,
  reason: auditReason,
});
