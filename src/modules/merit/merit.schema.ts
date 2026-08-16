import { z } from "zod";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";

/**
 * 서버 액션 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다 — 숫자 변환도 여기서 한다.
 */

/** 빈 문자열은 null로. 안 그러면 "선택 안 함"과 "빈 값"이 DB에서 갈린다. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .catch(null);

/** "5" → 5. 소수·0·음수·빈 값은 거부한다. 부호는 kind가 정한다. */
const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, "점수는 1 이상의 정수여야 합니다")
  .transform(Number)
  .refine((n) => n >= 1 && n <= 1000, "점수는 1~1000 사이여야 합니다");

export const trackSchema = z.enum(MERIT_TRACKS);
export const kindSchema = z.enum(MERIT_KINDS);

const labelSchema = z.string().trim().min(1, "항목명을 입력해 주세요").max(200);

export const createRuleSchema = z.object({
  track: trackSchema,
  kind: kindSchema,
  label: labelSchema,
  points: positiveInt,
  category: optionalText(50),
  description: optionalText(500),
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;

/**
 * 수정은 label·points·category·description만 받는다.
 * **track·kind는 스키마에 없다** — zod의 기본 동작이 모르는 키를 버리므로,
 * 화면이나 조작된 요청이 track을 보내도 여기서 조용히 사라진다.
 * 기록은 스냅샷이 지켜 주지만 벌점 규정이 상점으로 변신하는 것은
 * 카탈로그로서 틀렸다 (설계서 "규정 관리" 참고).
 */
export const updateRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  label: labelSchema,
  points: positiveInt,
  category: optionalText(50),
  description: optionalText(500),
});

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const ruleIdSchema = z.object({ ruleId: z.string().trim().min(1) });

/**
 * 부여 입력. **학년도가 없다** — 항상 getCurrentYear()로 들어간다.
 * 화면의 학년도 선택은 조회 전용이며, 그 값을 여기로 흘리면 지난 학년도를
 * 들여다보던 관리자가 새 벌점을 거기 꽂는 사고가 난다.
 */
export const awardSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  ruleId: z.string().trim().min(1),
  note: optionalText(500),
});

export type AwardInput = z.infer<typeof awardSchema>;

/**
 * 취소 입력. **사유는 필수다** — "관리자면 누구나 취소 가능"을 정당화하는
 * 근거가 사유와 감사로그이므로, 사유가 선택이면 그 근거가 무너진다.
 */
export const cancelSchema = z.object({
  awardId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "취소 사유를 입력해 주세요").max(500),
});

export type CancelInput = z.infer<typeof cancelSchema>;
