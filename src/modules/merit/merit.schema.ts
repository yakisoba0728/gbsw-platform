import { z } from "zod";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";
import { parseDateInputKst } from "@/lib/datetime";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";

/**
 * 서버 액션 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다 — 숫자 변환도 여기서 한다.
 */

/**
 * 선택 입력 문자열. 빈 문자열은 null로 — 안 그러면 "선택 안 함"과 "빈 값"이 갈린다.
 * 길이 초과는 오류로 낸다: 조용히 잘라내면 메모만 사라지는 실패가 된다.
 */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

/** "5" → 5. 소수·0·음수·빈 값은 거부한다. 부호는 kind가 정한다. */
const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, "점수는 1 이상의 정수여야 합니다.")
  .transform(Number)
  .refine((n) => n >= 1 && n <= 1000, "점수는 1~1000 사이여야 합니다.");

/**
 * `<input type="date">`의 `YYYY-MM-DD` → KST 자정 Date. 13월처럼 없는 값은
 * Invalid Date가 되므로 변환한 뒤 한 번 더 본다 — 정규식만으로는 안 걸린다.
 * (2월 30일은 Date가 3월 2일로 굴려 버려 여기서 안 걸린다.)
 */
const dateInputKst = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "발생일을 골라 주세요.")
  .transform(parseDateInputKst)
  .refine((value) => !Number.isNaN(value.getTime()), "없는 날짜입니다.");

export const trackSchema = z.enum(MERIT_TRACKS);
export const kindSchema = z.enum(MERIT_KINDS);

const labelSchema = z.string().trim().min(1, "항목명을 입력해 주세요.").max(200);

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
 * 수정은 label·points·category·description만 받는다. track·kind가 스키마에 없어서
 * 조작된 요청이 보내도 zod가 버린다 — 벌점 규정이 상점으로 변신하면 안 된다.
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
 * 벌점 기준의 상한. 오타가 조용히 넘어가는 것을 막는다 — 20 대신 2000을 넣으면
 * 오류도 없고 화면도 멀쩡한데 경고가 영영 안 뜬다.
 */
export const MAX_THRESHOLD = 1000;

/** 기준 한 칸. 라벨을 받아 문구에 넣는다 — "경고 기준은…" / "위험 기준은…". */
const thresholdInt = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} 기준은 1 이상의 정수여야 합니다.`)
    .transform(Number)
    .refine(
      (n) => n >= 1 && n <= MAX_THRESHOLD,
      `${label} 기준은 1~${MAX_THRESHOLD} 사이여야 합니다.`,
    );

/**
 * 벌점 기준 설정. 위험이 경고보다 커야 한다 — 같거나 작으면 경고 구간이
 * 통째로 사라지는데 화면에는 아무 이상이 없어 보인다.
 */
export const thresholdSchema = z
  .object({
    track: trackSchema,
    warn: thresholdInt("경고"),
    danger: thresholdInt("위험"),
  })
  .refine((v) => v.danger > v.warn, {
    message: "위험 기준은 경고 기준보다 커야 합니다.",
    path: ["danger"],
  });

export type ThresholdInput = z.infer<typeof thresholdSchema>;

/**
 * 부여 입력. 학년도가 없다 — 항상 getCurrentYear()로 들어간다. 발생일은 세션에서
 * 유도할 수 없는 사실이라 받되, 학년도 창 검사는 서비스가 한다.
 */
export const awardSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  // 항목 고르기가 hidden input이라 브라우저 required가 없다 — 여기가 유일한 방어선이고,
  // 문구가 없으면 zod의 영문 기본 메시지가 그대로 화면에 나간다.
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  occurredOn: dateInputKst,
  note: optionalText(500),
});

export type AwardInput = z.infer<typeof awardSchema>;

/**
 * 취소 입력. 사유는 필수다 — "관리자면 누구나 취소 가능"을 정당화하는 근거가
 * 사유와 감사로그이므로, 사유가 선택이면 그 근거가 무너진다.
 */
export const cancelSchema = z.object({
  awardId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "취소 사유를 입력해 주세요.").max(500),
});

export type CancelInput = z.infer<typeof cancelSchema>;

/**
 * 여러 명 한 번에 부여. 상한 100명 — 반 단위 작업에 충분하고, 실수로 전교생에게
 * 벌점을 주는 사고를 막는다.
 */
export const BULK_AWARD_LIMIT = 100;

export const bulkAwardSchema = z.object({
  studentProfileIds: z
    .array(z.string().trim().min(1))
    .min(1, "학생을 선택해 주세요.")
    .max(BULK_AWARD_LIMIT, `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`),
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  // 한 묶음은 같은 날 일어난 일이다 — 발생일도 하나만 받는다.
  occurredOn: dateInputKst,
  note: optionalText(500),
});

export type BulkAwardInput = z.infer<typeof bulkAwardSchema>;

/** 조회용 학년도. 범위는 학년도 모듈의 상수를 그대로 쓴다. */
const yearQuery = z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR).optional();

/** 반별 목록 조회 조건. 학년·반은 명단과 같은 범위(1~3학년)를 쓴다. */
export const classRosterSchema = z.object({
  grade: z.coerce.number().int().min(1).max(3),
  classNo: z.coerce.number().int().min(1).max(20),
  track: trackSchema,
  year: yearQuery,
});

export type ClassRosterInput = z.infer<typeof classRosterSchema>;

/** 한 학생의 내역 내보내기 조건. 학년도는 교내일 때만 의미가 있다. */
export const studentHistoryExportSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  track: trackSchema,
  year: yearQuery,
});

export type StudentHistoryExportInput = z.infer<typeof studentHistoryExportSchema>;

/** 묶음 통째로 취소. 사유는 단건과 같은 이유로 필수다. */
export const cancelBatchSchema = z.object({
  batchId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "취소 사유를 입력해 주세요.").max(500),
});

export type CancelBatchInput = z.infer<typeof cancelBatchSchema>;
