"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import * as decision from "@/modules/pass/decision.service";
import { PassError } from "@/modules/pass/pass.error";
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

/** 코드 → 화면 문구. 서비스는 코드만 던지고 옮기는 일은 전부 여기서 한다. */
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
  PASS_NOT_ACTIVE: "지금 쓸 수 있는 출입증이 아닙니다.",
};

const FORBIDDEN_MESSAGE = "권한이 없습니다.";
const UNKNOWN_MESSAGE = "처리하지 못했습니다.";

function fail(error: string): PassActionState {
  return { error, ok: false };
}

/**
 * zod가 낸 첫 문제의 문구. **한글이 아니면 기본 문구로 떨어뜨린다** —
 * discriminatedUnion의 유형 판별 실패는 영문 그대로 나온다
 * (「Invalid discriminator value. Expected 'OUTING' | 'OVERNIGHT'」).
 * 폼이 성한 한 닿지 않는 경로지만, 사용자 화면에 영문이 뜨는 길을 열어 둘 이유가 없다.
 */
function firstIssue(error: { issues: { message: string }[] }, fallback: string): string {
  const message = error.issues[0]?.message;
  return message && /[가-힣]/.test(message) ? message : fallback;
}

function toState(error: unknown): PassActionState {
  if (error instanceof ForbiddenError) return fail(FORBIDDEN_MESSAGE);
  if (error instanceof PassError) {
    return fail(MESSAGES[error.message] ?? UNKNOWN_MESSAGE);
  }
  throw error;
}

/** 신청·결재가 바뀌면 세 화면이 함께 흔들린다. */
function revalidatePass(passId?: string): void {
  revalidatePath("/pass");
  if (passId) revalidatePath(`/pass/${passId}`);
}

export async function requestAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  // 유형에 따라 오는 칸이 다르다. 스키마의 discriminatedUnion이 갈라 준다.
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
  return { error: null, ok: true };
}

export async function withdrawAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = withdrawPassSchema.safeParse({ passId: formData.get("passId") });
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
  return { error: null, ok: true };
}

export async function approveAction(
  _prev: PassActionState,
  formData: FormData,
): Promise<PassActionState> {
  const actor = await requireAuth();

  const parsed = approvePassSchema.safeParse({
    passId: formData.get("passId"),
    byProxy: formData.get("byProxy") ?? undefined,
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
  return { error: null, ok: true };
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

/**
 * 내보내기 결과. 서버는 행렬만 돌려주고 클라이언트(history/export-button.tsx)가
 * write-excel-file/browser로 xlsx를 만든다 — 서버 액션은 값만 넘길 수 있어
 * 셀 서식(생성자)을 실어 보내지 못한다.
 */
type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

const EXPORT_FAILED = "내보내지 못했습니다.";

/** 전체 내역의 현재 조건 전체를 내보낸다. 페이지 번호는 일부러 받지 않는다. */
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
    // 권한 거부를 폴백에 섞지 않는다 — 「내보내지 못했습니다」로 떨어지면
    // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
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
