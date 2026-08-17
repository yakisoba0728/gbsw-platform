import { z } from "zod";
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

/**
 * 관리자가 고칠 수 있는 항목.
 *
 * 이메일과 전화번호는 필수다 — 비울 수 없고, 오타는 여기서 고친다.
 * 이메일은 로그인 아이디이기도 하므로 바꾸면 다음 로그인부터 새 주소를 쓴다.
 * 역할은 여전히 제외한다 (권한이 통째로 넘어가는 변경이라 별도 절차가 필요하다).
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(50, "이름이 너무 깁니다."),
  email: emailField,
  phone: phoneField,

  // 아래는 학생일 때만 쓴다. 범위는 enrollment.schema.ts의 상수를 그대로 쓴다 (M6) —
  // 표 편집·명단 업로드와 같은 SchoolClass 테이블에 쓰는 값이라 여기서만 따로
  // 두면 반이 20개를 넘는 날 이 파일만 조용히 어긋난다.
  //
  // 문구도 같은 곳에서 가져온다. 범위만 가져오고 메시지를 비워 두면 zod의 영문
  // 기본 문구가 그대로 화면에 나간다 — invite.schema가 정확히 그래서 새고 있었다.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "생년월일 형식이 올바르지 않습니다.")
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

/**
 * 아래 넷은 **폼 전체**를 받는 스키마다. `updateUserSchema`는 서비스가 받는 입력
 * 모양이라 userId가 없다 — 액션이 함께 읽어야 하는 hidden input을 여기서 잇는다.
 *
 * 예전엔 이 네 액션이 `String(formData.get("userId"))`처럼 zod를 건너뛰고 값을
 * 읽었다. 저장소의 다른 아홉 액션 모듈은 전부 스키마를 통과시키는데 여기만
 * **경계가 비어 있었다** — "zod 검증은 경계에서 한 번만"(CLAUDE.md)에서 한 번이
 * 0번이던 자리다. 빈 문자열이 서비스까지 흘러가 NOT_FOUND로 되돌아오니 화면
 * 문구는 맞았지만, 서비스가 막아 주는 것과 경계가 막는 것은 다른 이야기다:
 * 서비스 쪽 방어를 하나 손보는 순간 여기로 무엇이든 들어올 수 있게 된다.
 *
 * 문구를 비워 두지 않는 이유는 위 updateUserSchema와 같다 — 비우면 zod의 영문
 * 기본 문구가 그대로 화면에 나간다.
 */

/**
 * 계정 id. 사람이 입력하는 값이 아니라 hidden input으로 오므로, 비었다면
 * 화면이 잘못 그려진 것이다 — 문구는 MESSAGES.NOT_FOUND와 같게 맞춘다.
 *
 * **문구를 스키마 자체에도 단다**(`z.string(...)`). `.min(1, …)`만 달면 칸이
 * 아예 없을 때 `formData.get()`이 주는 null이 타입 오류로 잡혀
 * "Invalid input: expected string, received null"이 화면에 그대로 나간다 —
 * 위 updateUserSchema가 경계하는 그 누출이 정확히 이 경로로 되살아난다.
 */
const NOT_FOUND_MESSAGE = "계정을 찾을 수 없습니다.";
const userIdField = z.string(NOT_FOUND_MESSAGE).trim().min(1, NOT_FOUND_MESSAGE);

/** 비밀번호 초기화. 폼이 보내는 것은 userId 하나뿐이다. */
export const userIdOnlySchema = z.object({ userId: userIdField });

/**
 * 계정 활성/비활성 토글.
 *
 * 폼은 `value={String(!user.active)}`로 "true"/"false"만 보낸다. 예전 코드는
 * `formData.get("active") === "true"`라 **오탈자든 빠진 값이든 전부 false**(=비활성)로
 * 읽혔다 — 계정을 잠그는 쪽으로 조용히 기울어 있었다. enum으로 받아 셋째 값이
 * 오면 거부한다.
 */
export const setUserActiveSchema = z.object({
  userId: userIdField,
  active: z
    .enum(["true", "false"], "계정 상태 값이 올바르지 않습니다.")
    .transform((value) => value === "true"),
});

/**
 * 완전 삭제.
 *
 * confirmName은 **여기서 정답과 대조하지 않는다** — 진짜 이름은 DB에 있고 그
 * 대조는 서비스의 일이다(NAME_MISMATCH). 경계가 보는 것은 "칸이 채워져 왔는가"
 * 뿐이다.
 */
const CONFIRM_NAME_MESSAGE = "확인을 위해 이름을 입력해 주세요.";

export const deleteUserSchema = z.object({
  userId: userIdField,
  confirmName: z
    .string(CONFIRM_NAME_MESSAGE)
    .trim()
    .min(1, CONFIRM_NAME_MESSAGE)
    .max(50, "이름이 너무 깁니다."),
});

/** 정보 수정 폼 = 서비스 입력 + userId. `.extend`로 잇는다 — 서비스가 받는
 *  모양(updateUserSchema)에 userId가 섞여 들어가지 않게 한다. */
export const updateUserFormSchema = updateUserSchema.extend({ userId: userIdField });
