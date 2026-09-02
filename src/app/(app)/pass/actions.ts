"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { firstIssue } from "@/lib/action-message";
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

const MESSAGES: Record<string, string> = {
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
  STUDENT_NOT_ELIGIBLE: "현재 학년도에 재학 중인 활성 학생에게만 부여할 수 있습니다.",
  PASS_BUSY: "명단 반영 중일 수 있습니다. 잠시 후 다시 시도해 주세요.",
};

const FORBIDDEN_MESSAGE = "권한이 없습니다.";
const UNKNOWN_MESSAGE = "처리하지 못했습니다.";

function fail(error: string): PassActionState {
  return { error, ok: false };
}

function toState(error: unknown): PassActionState {
  if (error instanceof ForbiddenError) return fail(FORBIDDEN_MESSAGE);
  if (error instanceof PassError) {
    return fail(MESSAGES[error.message] ?? UNKNOWN_MESSAGE);
  }
  throw error;
}

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

export async function requestAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = requestPassSchema.safeParse({
    type: formData.get("type"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    destination: formData.get("destination"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "입력을 확인해 주세요."));
  }

  try {
    await request.requestPass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass();
  return redirectWithPassFlash("requested", actor.id);
}

export async function withdrawAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = withdrawPassSchema.safeParse({
    passId: formData.get("passId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return fail("출입증을 찾을 수 없습니다.");

  try {
    await request.withdrawPass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass(parsed.data.passId);
  return { error: null, ok: true };
}

export async function consentAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = consentPassSchema.safeParse({
    passId: formData.get("passId"),
    consentNote: formData.get("consentNote"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "입력을 확인해 주세요."));
  }

  try {
    await request.consentPass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass(parsed.data.passId);
  return redirectWithPassFlash("consented", actor.id);
}

export async function approveAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = approvePassSchema.safeParse({
    passId: formData.get("passId"),
    byProxy: formData.get("byProxy") ?? undefined,
    decisionNote: formData.get("decisionNote"),
    consentNote: formData.get("consentNote"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "입력을 확인해 주세요."));
  }

  try {
    await decision.approvePass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass(parsed.data.passId);
  return redirectWithPassFlash("approved", actor.id);
}

export async function rejectAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = rejectPassSchema.safeParse({
    passId: formData.get("passId"),
    decisionNote: formData.get("decisionNote"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "반려 사유를 입력해 주세요."));
  }

  try {
    await decision.rejectPass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass(parsed.data.passId);
  return { error: null, ok: true };
}

export async function issueAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = issuePassSchema.safeParse({
    type: formData.get("type"),
    studentId: formData.get("studentId"),
    endTime: formData.get("endTime"),
    endDate: formData.get("endDate"),
    destination: formData.get("destination"),
    reason: formData.get("reason"),
    guardianConfirmed: formData.get("guardianConfirmed") ?? undefined,
    consentNote: formData.get("consentNote"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "입력을 확인해 주세요."));
  }

  try {
    await decision.issuePass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass();
  return { error: null, ok: true };
}

export async function cancelAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = cancelPassSchema.safeParse({
    passId: formData.get("passId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "입력을 확인해 주세요."));
  }

  try {
    await decision.cancelPass(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePass(parsed.data.passId);
  return { error: null, ok: true };
}

type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

const EXPORT_FAILED = "내보내지 못했습니다.";

export async function exportPassHistoryAction(
  input: PassHistoryExportInput,
): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = passHistoryExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await decision.exportPassHistory(actor, parsed.data)) };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: FORBIDDEN_MESSAGE, rows: [], filename: "" };
    }
    if (error instanceof PassError) {
      return { error: MESSAGES[error.message] ?? EXPORT_FAILED, rows: [], filename: "" };
    }
    console.error("출입증 내역 내보내기 실패:", error);
    return { error: EXPORT_FAILED, rows: [], filename: "" };
  }
}
