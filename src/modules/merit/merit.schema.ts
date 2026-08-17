import { z } from "zod";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";
import { parseDateInputKst } from "@/lib/datetime";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";

/**
 * 서버 액션 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다 — 숫자 변환도 여기서 한다.
 */

/**
 * 선택 입력 문자열. 빈 문자열은 null로 — 안 그러면 "선택 안 함"과 "빈 값"이
 * DB에서 갈린다. 폼에 칸이 아예 없으면 FormData.get이 null을 주므로 그것도 받는다.
 *
 * **길이 초과는 오류로 낸다.** 예전엔 `.catch(null)`이 붙어 있어서 600자짜리 메모가
 * 조용히 null이 됐다 — 화면에는 "부여했습니다"가 뜨고 메모만 사라지는, 아무도
 * 눈치채지 못하는 종류의 실패였다.
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
 * `<input type="date">`가 보내는 `YYYY-MM-DD` → **KST 자정** Date.
 *
 * 생년월일과 같은 경로를 쓴다 (parseDateInputKst 하나만 거친다) — 날짜만 뜻이
 * 있는 값을 어느 시간대의 자정으로 볼지 갈리면, 화면에는 안 드러나다가 값을
 * 직접 비교하는 순간 어긋난다. 13월처럼 아예 없는 값은 Invalid Date가 되므로
 * 변환한 뒤에 한 번 더 본다 — 정규식만으로는 안 걸린다.
 *
 * (2월 30일 같은 "넘치는 날"은 Date가 3월 2일로 굴려 버려서 여기서 안 걸린다.
 * <input type="date">가 보내지 않는 값이라 그대로 두지만, 예시로 쓰면 틀린다.)
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
 * 벌점 기준의 상한.
 *
 * 실제 학칙은 20~40점대이고, 기숙사가 입학부터 누적이어도 3년치가 세 자리를
 * 넘기기 어렵다. 그래도 상한을 두는 이유는 **오타가 조용히 넘어가기 때문이다** —
 * 20 대신 2000을 넣으면 오류도 안 나고 화면도 멀쩡한데 경고가 영영 안 뜬다.
 * 규정 한 건의 점수 상한(positiveInt의 1000)과 같은 수를 쓴다 — 두 값이 같은
 * 자릿수 감각을 공유해야 "1000점짜리 기준"이 이상하게 보인다.
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
 * 벌점 기준 설정. 트랙 하나씩 저장한다.
 *
 * **위험이 경고보다 커야 한다.** 같거나 작으면 demeritLevel이 danger를 먼저
 * 걸어서 경고 구간이 통째로 사라지는데, 화면에는 아무 이상이 없어 보인다.
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
 * 부여 입력. **학년도가 없다** — 항상 getCurrentYear()로 들어간다.
 * 화면의 학년도 선택은 조회 전용이며, 그 값을 여기로 흘리면 지난 학년도를
 * 들여다보던 관리자가 새 벌점을 거기 꽂는 사고가 난다.
 *
 * **발생일(occurredOn)은 있다.** 학년도와 달리 세션에서 유도할 수 없는 사실이라서다
 * — 금요일 일을 월요일에 넣는 사람만이 그 날짜를 안다. 다만 "그 학년도 안이어야
 * 한다"는 업무 규칙은 서비스가 지킨다 (여기서는 모양만 본다).
 */
export const awardSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  // 문구를 붙여 둔다 — 항목 고르기가 select에서 hidden input으로 바뀌면서
  // 브라우저의 required 검사가 사라졌다. 빈 채로 제출되면 여기가 유일한 방어선인데,
  // 문구가 없으면 zod의 영문 기본 메시지가 그대로 화면에 나간다.
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  occurredOn: dateInputKst,
  note: optionalText(500),
});

export type AwardInput = z.infer<typeof awardSchema>;

/**
 * 취소 입력. **사유는 필수다** — "관리자면 누구나 취소 가능"을 정당화하는
 * 근거가 사유와 감사로그이므로, 사유가 선택이면 그 근거가 무너진다.
 */
export const cancelSchema = z.object({
  awardId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "취소 사유를 입력해 주세요.").max(500),
});

export type CancelInput = z.infer<typeof cancelSchema>;

/**
 * 여러 명 한 번에 부여.
 *
 * 상한 100명 — 전교생이 300명이라 반 단위 작업에 충분하고, 실수로 전교생에게
 * 벌점을 주는 사고를 막는다. 학년도는 여기에도 없다 (단건 부여와 같은 이유).
 */
export const BULK_AWARD_LIMIT = 100;

export const bulkAwardSchema = z.object({
  studentProfileIds: z
    .array(z.string().trim().min(1))
    .min(1, "학생을 선택해 주세요.")
    .max(BULK_AWARD_LIMIT, `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`),
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  // 한 묶음은 같은 날 일어난 일이다 — "점호 지각 5명"이 사람마다 다른 날일 수 없다.
  occurredOn: dateInputKst,
  note: optionalText(500),
});

export type BulkAwardInput = z.infer<typeof bulkAwardSchema>;

/**
 * 조회용 학년도. 범위는 학년도 모듈의 상수를 그대로 쓴다 — 여기에 2000·2100을 다시
 * 적으면 학교가 범위를 넓힐 때 두 곳이 갈린다 (enrollment.schema.ts와 같은 처리).
 */
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
