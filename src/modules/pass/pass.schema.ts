import { z } from "zod";
import { PASS_STATUSES, PASS_TYPES } from "@/core/authz/pass-type";
import { isCanonicalDateInput } from "@/lib/date-input";
import {
  isCanonicalTimeInput,
  kstDayStart,
  kstNextDayStart,
  parseDateInputKst,
} from "@/lib/datetime";
import { optionalText, searchText } from "@/lib/zod-fields";

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

/*
 * 내보내기 한 번이 만드는 행의 상한이다. 전교 300명이 기본 30일을 뽑으면 천 건
 * 안쪽이라 실사용에는 걸리지 않고, 기간을 크게 잡은 요청만 막는다. 상한이 없으면
 * 조회·시트 생성·전송이 한 요청에 몰려 그동안 다른 요청이 밀린다.
 */
export const PASS_HISTORY_EXPORT_MAX_ROWS = 5_000;

/* 교사 현황의 두 목록(결재 대기·지금 나가 있는 학생) 페이지 크기. 100·200에서
   줄였다 — 항목마다 결재 패널이나 취소 버튼이 붙어 한 페이지가 길수록 화면과
   클라이언트 코드가 함께 무거워지고, 전교 300명 규모에서는 50건이면 평시 목록이
   한 페이지에 들어간다. 넘치는 건 이제 다음 쪽으로 갈 수 있다. */
export const PASS_ADMIN_PAGE_SIZE = 50;

/* 커서 자취의 최대 길이. 「이전」이 앞 페이지로 정확히 돌아가려면 지나온 커서를
   주소에 들고 다녀야 하므로 주소가 끝없이 길어지지 않게 자른다(50건 × 40쪽 = 2,000건). */
export const PASS_ADMIN_CURSOR_DEPTH = 40;

/* 자취는 점으로 잇는다 — URLSearchParams가 그대로 두는 글자라 주소에 %2C가 남지 않는다. */
export const PASS_CURSOR_SEPARATOR = ".";

const cursorId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const cursorTrailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.length > 0
      ? value.split(PASS_CURSOR_SEPARATOR)
      : [],
  z.array(cursorId).max(PASS_ADMIN_CURSOR_DEPTH),
);

/* 주소의 커서 자취를 읽는다. 형식이 어긋나면 첫 페이지로 떨어뜨린다 — 손으로 고친
   주소가 화면을 깨뜨리지 않는다. */
export function parseCursorTrail(
  value: string | string[] | undefined,
): string[] {
  const parsed = cursorTrailSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const passHistorySearch = searchText();

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
