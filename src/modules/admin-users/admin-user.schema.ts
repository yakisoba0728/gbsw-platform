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
} from "@/modules/enrollment/enrollment.schema";

const USER_CHANGED_MESSAGE =
  "계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.";

/**
 * 교사가 고칠 수 있는 항목. 이메일은 로그인 아이디라 바꾸면 다음 로그인부터
 * 새 주소를 쓴다. 역할은 여기서 못 바꾼다.
 */
export const updateUserSchema = z.object({
  updatedAt: z.iso.datetime(USER_CHANGED_MESSAGE).transform((value) => new Date(value)),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50, "이름이 너무 깁니다."),
  email: emailField,
  phone: phoneField,

  // 아래는 학생일 때만 쓴다. 범위와 문구 모두 enrollment.schema.ts에서 가져온다 —
  // 문구를 비우면 zod의 영문 기본 문구가 화면에 그대로 나간다.
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

/*
 * 아래는 폼 전체를 받는 스키마다. updateUserSchema는 서비스가 받는 모양이라
 * userId가 없어, 액션이 함께 읽는 hidden input을 여기서 잇는다.
 */

/**
 * 계정 id. hidden input으로 오므로 비었다면 화면이 잘못 그려진 것이다.
 * `z.string(...)`에도 문구를 단다 — 칸이 없으면 null이 와서 타입 오류가 샌다.
 */
const NOT_FOUND_MESSAGE = "계정을 찾을 수 없습니다.";
const userIdField = z.string(NOT_FOUND_MESSAGE).trim().min(1, NOT_FOUND_MESSAGE);

/**
 * 확인 모달이 받는 사유. **담을 자리가 없어 감사로그 metadata로만 간다** —
 * 계정 표에는 「왜 껐는지」를 적을 칸이 없고, 만들면 화면 어디에도 안 쓰이는
 * 열이 하나 는다.
 */
const auditReason = z
  // 칸이 없으면 formData.get이 null을 준다 — optional()은 undefined만 받으므로
  // 빈 문자열로 눕히고 나서 검사한다. pass.schema의 optionalText와 같은 짜임이다.
  .preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().max(200, "사유는 200자를 넘을 수 없습니다."),
  )
  .transform((v) => (v.length === 0 ? undefined : v));

/** 비밀번호 초기화. 폼이 보내는 것은 userId와 사유뿐이다. */
export const userIdOnlySchema = z.object({
  userId: userIdField,
  reason: auditReason,
});

/**
 * 계정 활성/비활성 토글. enum으로 받아 셋째 값을 거부한다 — boolean 비교로
 * 읽으면 빠진 값도 전부 비활성으로 기운다.
 */
export const setUserActiveSchema = z.object({
  userId: userIdField,
  active: z
    .enum(["true", "false"], "계정 상태 값이 올바르지 않습니다.")
    .transform((value) => value === "true"),
  reason: auditReason,
});

/** 완전 삭제. 이름 대조는 서비스가 한다 — 여기서는 칸이 채워졌는지만 본다. */
const CONFIRM_NAME_MESSAGE = "확인을 위해 이름을 입력해 주세요.";

export const deleteUserSchema = z.object({
  userId: userIdField,
  confirmName: z
    .string(CONFIRM_NAME_MESSAGE)
    .trim()
    .min(1, CONFIRM_NAME_MESSAGE)
    .max(50, "이름이 너무 깁니다."),
});

/** 정보 수정 폼 = 서비스 입력 + userId. 서비스가 받는 모양은 그대로 둔다. */
export const updateUserFormSchema = updateUserSchema.extend({
  userId: userIdField,
  reason: auditReason,
});
