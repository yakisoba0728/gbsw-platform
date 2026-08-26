import { z } from "zod";
import { isCanonicalDateInput } from "@/lib/date-input";
import { isCanonicalTimeInput } from "@/lib/datetime";

/**
 * 서버 액션 경계에서만 쓴다. 서비스는 여기를 통과한 타입을 신뢰한다.
 * FormData에서 오므로 입력은 전부 문자열이다.
 *
 * **모양만 본다.** 기간이 말이 되는가(끝이 시작보다 늦은가, 7일을 넘는가)는
 * 업무 규칙이라 pass.window.ts가 판단한다.
 */

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

/** 빈 문자열은 null로 — "안 적음"과 "빈 값"이 갈리면 안 된다. */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (v == null ? "" : v),
      z.string().trim().max(max, `${max}자를 넘을 수 없습니다.`),
    )
    .transform((v) => (v.length === 0 ? null : v));

const id = z.string().trim().min(1).max(64);

/**
 * 학생 신청. 유형에 따라 날짜 칸이 통째로 갈리므로 discriminatedUnion으로 나눈다 —
 * 한 객체에 전부 optional로 두면 "외박인데 startTime이 왔다"를 서비스가 걸러야 한다.
 */
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
    endDate: dateInput,
    destination,
    reason,
  }),
]);

export type RequestPassInput = z.infer<typeof requestPassSchema>;

/**
 * 교사 직접 부여. **시작 시각을 받지 않는다** — 「지금 내보낸다」는 상황이라
 * 항상 지금부터다. 폼이 절반으로 줄고 「과거로 부여」라는 상태가 안 생긴다.
 *
 * 외박이면 `guardianConfirmed`가 필수다(체크박스는 켜야만 "on"이 온다) —
 * 교사가 직접 부여해도 보호자를 확인했다는 사실은 기록에 남아야 한다.
 */
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
    destination,
    reason,
    guardianConfirmed: z.literal("on", { message: "보호자 확인을 체크해 주세요." }),
    consentNote: optionalText(100),
  }),
]);

export type IssuePassInput = z.infer<typeof issuePassSchema>;

/** 승인. 외박인데 아직 동의가 없으면 보호자 확인 대행이 함께 와야 한다. */
export const approvePassSchema = z.object({
  passId: id,
  byProxy: z.literal("on").optional(),
  consentNote: optionalText(100),
});
export type ApprovePassInput = z.infer<typeof approvePassSchema>;

/** 반려. 사유는 필수다 — 「왜 안 되는지」를 학생이 알아야 다시 낸다. */
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

export const withdrawPassSchema = z.object({ passId: id });
export type WithdrawPassInput = z.infer<typeof withdrawPassSchema>;

/** 판독 화면이 받는 토큰. 길이만 본다 — 모양 판정은 verifyToken이 한다. */
export const verifyTokenSchema = z.object({
  token: z.string().trim().min(1).max(128),
});
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
