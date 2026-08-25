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
} from "@/modules/enrollment/enrollment.schema";

const name = z
  .string()
  .trim()
  .min(1, "이름을 입력해 주세요.")
  .max(50, "이름이 너무 깁니다.");

/**
 * 문구를 네 검사에 모두 단다. 하나라도 비우면 zod 기본 영문 문구
 * ("Too big: expected number to be <=365")가 한글 화면의 오류 배너로 그대로 나간다 —
 * 액션이 `Number(raw)`로 넘기므로 비숫자는 NaN이 되어 `.number()`에서 걸린다.
 */
const EXPIRY_RANGE_MESSAGE = "유효기간은 1~365일 사이의 정수여야 합니다.";

const expiresInDays = z
  .number(EXPIRY_RANGE_MESSAGE)
  .int(EXPIRY_RANGE_MESSAGE)
  .min(1, EXPIRY_RANGE_MESSAGE)
  .max(365, EXPIRY_RANGE_MESSAGE)
  .optional()
  .describe("비우면 무기한");

/** 교사가 학생 코드를 발급할 때 입력하는 값. */
export const createStudentInviteSchema = z.object({
  name,
  birthDate: canonicalDateInputSchema(
    "생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.",
    "존재하지 않는 날짜입니다.",
  ),
  // 범위와 문구를 같은 곳에서 가져온다 — 문구를 비우면 zod의 영문 기본 문구가
  // 화면에 그대로 나간다.
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

/** 교사가 교사 코드를 발급할 때 입력하는 값. */
export const createAdminInviteSchema = z.object({
  name,
  expiresInDays,
});

/** 학생이 학부모 코드를 만들 때 입력하는 값. 학생 본인은 세션에서 판별한다. */
export const createParentInviteSchema = z.object({
  name,
  expiresInDays,
});

/** 교사가 학생을 지정해 학부모 코드를 발급할 때. */
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
 * 코드에 저장하는 사전등록 신원. 가입 때 이 값과 입력을 대조한다.
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

/**
 * 초대코드 폐기. **사유가 필수다** — 취소·삭제와 같은 규약이다.
 * 폐기하면 목록에서 대기 상태가 사라지는데, 왜 없앴는지를 되짚을 자료가
 * 감사로그밖에 없다(로그 화면이 `metadata.reason`을 「사유: …」로 그린다).
 */
export const revokeInviteSchema = z.object({
  inviteId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "폐기 사유를 입력해 주세요.").max(500),
});

export type RevokeInviteInput = z.infer<typeof revokeInviteSchema>;
