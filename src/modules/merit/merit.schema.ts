import { z } from "zod";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import {
  MAX_CLASS_NO,
  MAX_GRADE,
  MIN_CLASS_NO,
  MIN_GRADE,
} from "@/modules/student/student-position";
import { optionalText, searchText } from "@/lib/zod-fields";

const positiveInt = z
  .string()
  .trim()
  .regex(/^\d+$/, "점수는 1 이상의 정수여야 합니다.")
  .transform(Number)
  .refine((n) => n >= 1 && n <= 1000, "점수는 1~1000 사이여야 합니다.");

const trackSchema = z.enum(MERIT_TRACKS);
const kindSchema = z.enum(MERIT_KINDS);

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

export const updateRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  updatedAt: z
    .iso
    .datetime("다른 교사가 규정을 바꿨습니다. 새로고침 후 다시 저장해 주세요.")
    .transform((value) => new Date(value)),
  label: labelSchema,
  points: positiveInt,
  category: optionalText(50),
  description: optionalText(500),
});

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

export const deleteRuleSchema = z.object({
  ruleId: z.string().trim().min(1),
  updatedAt: z
    .iso
    .datetime("다른 교사가 규정을 바꿨습니다. 새로고침 후 다시 삭제해 주세요.")
    .transform((value) => new Date(value)),
  reason: z
    .string("삭제 사유를 입력해 주세요.")
    .trim()
    .min(1, "삭제 사유를 입력해 주세요.")
    .max(500),
});

export type DeleteRuleInput = z.infer<typeof deleteRuleSchema>;

export const MAX_THRESHOLD = 1000;

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

const thresholdUpdatedAt = z
  .preprocess((v) => (v == null ? "" : v), z.string().trim())
  .pipe(
    z.union([
      z.literal(""),
      z.iso.datetime("다른 교사가 기준을 바꿨습니다. 새로고침 후 다시 저장해 주세요."),
    ]),
  )
  .transform((value) => (value === "" ? null : new Date(value)));

export const thresholdSchema = z
  .object({
    track: trackSchema,
    updatedAt: thresholdUpdatedAt,
    warn: thresholdInt("경고"),
    danger: thresholdInt("위험"),
  })
  .refine((v) => v.danger > v.warn, {
    message: "위험 기준은 경고 기준보다 커야 합니다.",
    path: ["danger"],
  });

export type ThresholdInput = z.infer<typeof thresholdSchema>;

export const awardSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  note: optionalText(500),
});

export type AwardInput = z.infer<typeof awardSchema>;

export const cancelSchema = z.object({
  awardId: z.string().trim().min(1),
  reason: z.string().trim().min(1, "취소 사유를 입력해 주세요.").max(500),
});

export type CancelInput = z.infer<typeof cancelSchema>;

export const BULK_AWARD_LIMIT = 100;

export const bulkAwardSchema = z.object({
  studentProfileIds: z
    .array(z.string().trim().min(1))
    .min(1, "학생을 선택해 주세요.")
    .max(BULK_AWARD_LIMIT, `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`),
  ruleId: z.string().trim().min(1, "부여할 항목을 골라 주세요."),
  note: optionalText(500),
});

export type BulkAwardInput = z.infer<typeof bulkAwardSchema>;

const yearQuery = z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR).optional();

const classRosterBase = z.object({
  grade: z.coerce.number().int().min(MIN_GRADE).max(MAX_GRADE).optional(),
  classNo: z.coerce.number().int().min(MIN_CLASS_NO).max(MAX_CLASS_NO).optional(),
  track: trackSchema,
  year: yearQuery,
});

export type ClassRosterInput = z.infer<typeof classRosterBase>;

export const classRosterSchema = classRosterBase.transform(
  (scope): ClassRosterInput =>
    scope.grade === undefined ? { ...scope, classNo: undefined } : scope,
);

export const classRosterExportSchema = classRosterBase.extend({
  grade: z.coerce.number().int().min(MIN_GRADE).max(MAX_GRADE),
  classNo: z.coerce.number().int().min(MIN_CLASS_NO).max(MAX_CLASS_NO),
});

export type ClassRosterExportInput = z.infer<typeof classRosterExportSchema>;

export const studentHistoryExportSchema = z.object({
  studentProfileId: z.string().trim().min(1),
  track: trackSchema,
  year: yearQuery,
});

export type StudentHistoryExportInput = z.infer<typeof studentHistoryExportSchema>;

export const RECENT_AWARD_PAGE_SIZE = 20;

// 학생 검색 드롭다운이 한 번에 고를 수 있는 후보 수.
export const STUDENT_SEARCH_LIMIT = 30;

// 대시보드 요약이 최근 며칠의 부여를 보는지.
export const SUMMARY_DAYS = 7;

export const RECENT_AWARD_STATUSES = ["ACTIVE", "CANCELLED"] as const;
export type RecentAwardStatus = (typeof RECENT_AWARD_STATUSES)[number];

export const recentAwardsQuerySchema = z.object({
  track: trackSchema.default("SCHOOL"),
  kind: kindSchema.optional(),
  status: z.enum(RECENT_AWARD_STATUSES).optional(),
  q: searchText(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type RecentAwardsQuery = z.infer<typeof recentAwardsQuerySchema>;

export const recentAwardsExportSchema = recentAwardsQuerySchema.omit({ page: true });
export type RecentAwardsExportInput = z.infer<typeof recentAwardsExportSchema>;

export type RecentAwardFilter = Pick<
  RecentAwardsExportInput,
  "track" | "kind" | "status" | "q"
>;
