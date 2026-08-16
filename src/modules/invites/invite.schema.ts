import { z } from "zod";
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
} from "@/modules/enrollment/enrollment.schema";

const name = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(50, "이름이 너무 깁니다.");

const expiresInDays = z
  .number()
  .int()
  .min(1)
  .max(365)
  .optional()
  .describe("비우면 무기한");

/**
 * 관리자가 학생 코드를 발급할 때 입력하는 값.
 *
 * 학년·반·번호 범위는 enrollment.schema.ts의 상수를 그대로 쓴다 (M6) — 표
 * 편집·명단 업로드와 같은 SchoolClass 테이블에 쓰는 값이다.
 */
export const createStudentInviteSchema = z.object({
  name,
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "존재하지 않는 날짜입니다."),
  // 문구도 enrollment.schema의 상수를 쓴다. 범위 상수만 가져오고 메시지를
  // 비워 두면 zod의 영문 기본 문구("Too big: expected number to be <=3")가
  // 그대로 화면에 나간다 — 액션의 `?? "입력값을 확인해 주세요."` 폴백은
  // issues[0].message가 이미 채워져 있어서 절대 닿지 않는다.
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

/** 관리자가 관리자 코드를 발급할 때 입력하는 값. */
export const createAdminInviteSchema = z.object({
  name,
  expiresInDays,
});

/** 학생이 학부모 코드를 만들 때 입력하는 값. 학생 본인은 세션에서 판별한다. */
export const createParentInviteSchema = z.object({
  name,
  expiresInDays,
});

/** 관리자가 학생을 지정해 학부모 코드를 발급할 때. */
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

/**
 * 코드에 저장하는 사전등록 신원. 가입 시 이 값과 입력을 대조한다.
 * DB에는 Json으로 들어가므로 읽을 때 반드시 이 스키마로 파싱한다.
 */
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

export type StudentInviteMeta = z.infer<typeof studentInviteMetaSchema>;
export type NamedInviteMeta = z.infer<typeof namedInviteMetaSchema>;
