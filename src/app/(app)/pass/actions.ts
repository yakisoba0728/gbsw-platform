"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { defineFormAction } from "@/lib/action";
import {
  type ExportState,
  EXPORT_FAILED,
  exportErrorState,
  exportFailure,
} from "@/lib/export-state";
import * as decision from "@/modules/pass/decision.service";
import { PassError } from "@/modules/pass/pass.error";
import {
  issuePassFlash,
  PASS_FLASH_COOKIE,
  PASS_FLASH_MAX_AGE_SECONDS,
  type PassFlashKind,
} from "@/modules/pass/pass-flash";
import {
  approvePassSchema,
  cancelPassSchema,
  consentPassSchema,
  issuePassSchema,
  passHistoryExportSchema,
  rejectPassSchema,
  requestPassSchema,
  withdrawPassSchema,
  type PassHistoryExportInput,
} from "@/modules/pass/pass.schema";
import { MAX_OVERNIGHT_DAYS } from "@/modules/pass/pass.window";
import * as request from "@/modules/pass/request.service";
import type { PassActionState } from "./action-state";

const MESSAGES: Record<string, string> & { FORBIDDEN: string } = {
  FORBIDDEN: "권한이 없습니다.",
  PASS_NOT_FOUND: "출입증을 찾을 수 없습니다.",
  NO_STUDENT_PROFILE: "학생 계정이 아닙니다.",
  ALREADY_DECIDED: "이미 처리된 신청입니다. 화면을 새로 고쳐 주세요.",
  ALREADY_CANCELLED: "이미 취소된 출입증입니다.",
  CONSENT_REQUIRED: "보호자 확인이 먼저입니다.",
  CONSENT_NOT_ALLOWED: "외출에는 보호자 확인이 없습니다.",
  INVALID_PERIOD: "끝나는 시각이 시작보다 빠릅니다.",
  PERIOD_TOO_LONG: `외박은 한 번에 ${MAX_OVERNIGHT_DAYS}일까지입니다.`,
  START_IN_PAST: "시작 시각이 지났습니다.",
  OVERLAPPING_PASS: "같은 기간에 이미 신청한 출입증이 있습니다.",
  PASS_EXPIRED: "이미 종료된 신청은 처리할 수 없습니다.",
  NOT_ENROLLED: "현재 학년도 재학생만 신청할 수 있습니다.",
  STUDENT_NOT_ELIGIBLE: "현재 학년도에 재학 중인 활성 학생에게만 부여할 수 있습니다.",
  PASS_BUSY: "명단 반영 중일 수 있습니다. 잠시 후 다시 시도해 주세요.",
};

const UNKNOWN_MESSAGE = "처리하지 못했습니다.";

function revalidatePass(passId?: string): void {
  revalidatePath("/pass");
  if (passId) revalidatePath(`/pass/${passId}`);
}

async function redirectWithPassFlash(
  kind: PassFlashKind,
  userId: string,
): Promise<never> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0];
  const origin = requestHeaders.get("origin");
  cookieStore.set(PASS_FLASH_COOKIE, issuePassFlash(kind, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: forwardedProtocol === "https" || origin?.startsWith("https://") === true,
    path: "/pass",
    maxAge: PASS_FLASH_MAX_AGE_SECONDS,
  });
  redirect("/pass");
}

export const requestAction = defineFormAction<PassActionState>()({
  schema: requestPassSchema,
  input: (formData) => ({
    type: formData.get("type"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    destination: formData.get("destination"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await request.requestPass(actor, data);
    revalidatePass();
    await redirectWithPassFlash("requested", actor.id);
    // redirect는 항상 던지므로 여기에는 도달하지 않는다.
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const withdrawAction = defineFormAction<PassActionState>()({
  schema: withdrawPassSchema,
  input: (formData) => ({
    passId: formData.get("passId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await request.withdrawPass(actor, data);
    revalidatePass(data.passId);
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const consentAction = defineFormAction<PassActionState>()({
  schema: consentPassSchema,
  input: (formData) => ({
    passId: formData.get("passId"),
    consentNote: formData.get("consentNote"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await request.consentPass(actor, data);
    revalidatePass(data.passId);
    await redirectWithPassFlash("consented", actor.id);
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const approveAction = defineFormAction<PassActionState>()({
  schema: approvePassSchema,
  input: (formData) => ({
    passId: formData.get("passId"),
    byProxy: formData.get("byProxy") ?? undefined,
    decisionNote: formData.get("decisionNote"),
    consentNote: formData.get("consentNote"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await decision.approvePass(actor, data);
    revalidatePass(data.passId);
    await redirectWithPassFlash("approved", actor.id);
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const rejectAction = defineFormAction<PassActionState>()({
  schema: rejectPassSchema,
  input: (formData) => ({
    passId: formData.get("passId"),
    decisionNote: formData.get("decisionNote"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await decision.rejectPass(actor, data);
    revalidatePass(data.passId);
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "반려 사유를 입력해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const issueAction = defineFormAction<PassActionState>()({
  schema: issuePassSchema,
  input: (formData) => ({
    type: formData.get("type"),
    studentId: formData.get("studentId"),
    endTime: formData.get("endTime"),
    endDate: formData.get("endDate"),
    destination: formData.get("destination"),
    reason: formData.get("reason"),
    guardianConfirmed: formData.get("guardianConfirmed") ?? undefined,
    consentNote: formData.get("consentNote"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await decision.issuePass(actor, data);
    revalidatePass();
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export const cancelAction = defineFormAction<PassActionState>()({
  schema: cancelPassSchema,
  input: (formData) => ({
    passId: formData.get("passId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await decision.cancelPass(actor, data);
    revalidatePass(data.passId);
    return { error: null, ok: true };
  },
  errorClass: PassError,
  messages: MESSAGES,
  logPrefix: "[pass]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: UNKNOWN_MESSAGE,
});

export async function exportPassHistoryAction(
  input: PassHistoryExportInput,
): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = passHistoryExportSchema.safeParse(input);
  if (!parsed.success) {
    return exportFailure("조회 조건을 확인해 주세요.");
  }

  try {
    return { error: null, ...(await decision.exportPassHistory(actor, parsed.data)) };
  } catch (error) {
    return exportErrorState(error, {
      logLabel: "출입증 내역 내보내기 실패:",
      forbiddenMessage: MESSAGES.FORBIDDEN,
      translate: (e) =>
        e instanceof PassError ? (MESSAGES[e.message] ?? EXPORT_FAILED) : null,
    });
  }
}
