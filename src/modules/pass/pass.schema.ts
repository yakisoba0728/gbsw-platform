import { z } from "zod";
import { PASS_STATUSES, PASS_TYPES } from "@/core/authz/pass-type";
import { isCanonicalDateInput } from "@/lib/date-input";
import {
  isCanonicalTimeInput,
  kstDayStart,
  kstNextDayStart,
  parseDateInputKst,
} from "@/lib/datetime";

const dateInput = z
  .string()
  .trim()
  .refine(isCanonicalDateInput, "날짜를 골라 주세요.");

const timeInput = z
  .string()
  .trim()
  .refine(isCanonicalTimeInput, "시각을 골라 주세요.");

const destination = z
  .string()
  .trim()
  .min(1, "행선지를 입력해 주세요.")
  .max(60, "행선지는 60자를 넘을 수 없습니다.");

const reason = z
  .string()
  .trim()
  .min(1, "사유를 입력해 주세요.")
  .max(200, "사유는 200자를 넘을 수 없습니다.");

const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

const id = z.string().trim().min(1).max(64);

export const requestPassSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("OUTING"),
    date: dateInput,
    startTime: timeInput,
    endTime: timeInput,
    destination,
    reason,
  }),
  z.object({
    type: z.literal("OVERNIGHT"),
    startDate: dateInput,
    startTime: timeInput,
    endDate: dateInput,
    endTime: timeInput,
    destination,
    reason,
  }),
]);

export type RequestPassInput = z.infer<typeof requestPassSchema>;

export const issuePassSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("OUTING"),
    studentId: id,
    endTime: timeInput,
    destination,
    reason,
  }),
  z.object({
    type: z.literal("OVERNIGHT"),
    studentId: id,
    endDate: dateInput,
    endTime: timeInput,
    destination,
    reason,
    guardianConfirmed: z.literal("on", { message: "보호자 확인을 체크해 주세요." }),
    consentNote: optionalText(100),
  }),
]);

export type IssuePassInput = z.infer<typeof issuePassSchema>;

export const approvePassSchema = z.object({
  passId: id,
  byProxy: z.literal("on").optional(),
  decisionNote: optionalText(200),
  consentNote: optionalText(100),
});
export type ApprovePassInput = {
  passId: string;
  byProxy?: "on";
  decisionNote?: string | null;
  consentNote?: string | null;
};

export const rejectPassSchema = z.object({
  passId: id,
  decisionNote: z
    .string()
    .trim()
    .min(1, "반려 사유를 입력해 주세요.")
    .max(200, "반려 사유는 200자를 넘을 수 없습니다."),
});
export type RejectPassInput = z.infer<typeof rejectPassSchema>;

export const cancelPassSchema = z.object({
  passId: id,
  reason: optionalText(200),
});
export type CancelPassInput = z.infer<typeof cancelPassSchema>;

export const consentPassSchema = z.object({
  passId: id,
  consentNote: optionalText(100),
});
export type ConsentPassInput = z.infer<typeof consentPassSchema>;

export const withdrawPassSchema = z.object({
  passId: id,
  reason: optionalText(200),
});
export type WithdrawPassInput = z.infer<typeof withdrawPassSchema>;

export const verifyCodeSchema = z.object({
  code: z.string().trim().min(1).max(128),
});

export const PASS_HISTORY_PAGE_SIZE = 20;

export const PASS_HISTORY_DEFAULT_DAYS = 30;

const passHistorySearch = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().max(60, "검색어는 60자를 넘을 수 없습니다.").optional(),
);

const historyDate = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().refine(isCanonicalDateInput, "날짜를 골라 주세요.").optional(),
);

const passHistoryQueryBaseSchema = z.object({
  type: z.enum(PASS_TYPES).optional(),
  status: z.enum(PASS_STATUSES).optional(),
  q: passHistorySearch,
  from: historyDate,
  to: historyDate,
  studentProfileId: id.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

function rejectReversedHistoryPeriod(
  value: { from?: string; to?: string },
  context: { addIssue: (issue: { code: "custom"; message: string; path: string[] }) => void },
): void {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      message: "시작일은 종료일보다 늦을 수 없습니다.",
      path: ["to"],
    });
  }
}

export const passHistoryQuerySchema = passHistoryQueryBaseSchema.superRefine(
  rejectReversedHistoryPeriod,
);

export type PassHistoryQuery = z.infer<typeof passHistoryQuerySchema>;

export const passHistoryExportSchema = passHistoryQueryBaseSchema
  .omit({
    page: true,
    studentProfileId: true,
  })
  .superRefine(rejectReversedHistoryPeriod);
export type PassHistoryExportInput = z.infer<typeof passHistoryExportSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function passHistoryRange(
  query: { from?: string; to?: string },
  now: Date = new Date(),
): { since: Date; until: Date | null } {
  const since = query.from
    ? parseDateInputKst(query.from)
    : new Date(
        kstDayStart(now).getTime() - (PASS_HISTORY_DEFAULT_DAYS - 1) * DAY_MS,
      );

  return { since, until: query.to ? kstNextDayStart(query.to) : null };
}
