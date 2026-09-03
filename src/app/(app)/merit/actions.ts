"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import type { MeritTrack } from "@/core/authz/merit-track";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
import {
  type ExportState,
  EXPORT_FAILED,
  exportErrorState,
  exportFailure,
} from "@/lib/export-state";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { MeritError } from "@/modules/merit/merit.error";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelSchema,
  classRosterExportSchema,
  recentAwardsExportSchema,
  studentHistoryExportSchema,
} from "@/modules/merit/merit.schema";
import type { RecentAwardsExportInput } from "@/modules/merit/merit.schema";
import type { MeritActionState } from "./action-state";

const MESSAGES: Record<string, string> & { FORBIDDEN: string } = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
  RULE_INACTIVE: "삭제된 규정입니다.",
  AWARD_NOT_FOUND: "기록을 찾을 수 없습니다.",
  ALREADY_CANCELLED: "이미 취소된 기록입니다.",
  STUDENT_NOT_FOUND: "재학 중인 학생이 아닙니다.",
  NO_STUDENTS: "학생을 선택해 주세요.",
  TOO_MANY_STUDENTS: `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`,
  OCCURRED_OUT_OF_YEAR: "오늘이 현재 학년도 밖입니다. 학생 관리에서 새 학년도로 바꾸세요.",
  OCCURRED_IN_FUTURE: "발생일이 미래입니다.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 없습니다. 학생 관리에서 학년도를 먼저 만드세요.";

function isTransactionTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2028"
  );
}

// AcademicYearError와 트랜잭션 경합은 일반 도메인 사전보다 먼저 옮긴다.
function translateError(error: unknown): string | null {
  if (error instanceof AcademicYearError) return NO_CURRENT_YEAR_MESSAGE;
  if (isTransactionTimeout(error)) {
    console.error("[merit] 트랜잭션이 예산 안에 끝나지 않았습니다.", error);
    return "다른 작업이 학년도를 쓰고 있습니다. 잠시 뒤 다시 부여하세요.";
  }
  return null;
}

export const awardAction = defineFormAction<MeritActionState>()({
  schema: awardSchema,
  input: (formData) => ({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  }),
  failState: (error, formData) => ({
    error,
    ok: false,
    count: null,
    note: text(formData, "note"),
  }),
  run: async (actor, data) => {
    await service.awardMerit(actor, data);
    revalidatePath(`/students/${data.studentProfileId}`);
    revalidatePath(`/merit/students/${data.studentProfileId}`);
    revalidatePath("/merit");
    revalidatePath("/merit/recent");
    return { error: null, ok: true, count: 1 };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "부여할 항목을 골라 주세요.",
  failureMessage: "처리하지 못했습니다.",
  onError: translateError,
});

export const bulkAwardAction = defineFormAction<MeritActionState>()({
  schema: bulkAwardSchema,
  input: (formData) => ({
    studentProfileIds: formData.getAll("studentProfileIds").map(String),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  }),
  failState: (error, formData) => ({
    error,
    ok: false,
    count: null,
    note: text(formData, "note"),
  }),
  run: async (actor, data) => {
    const { count } = await service.bulkAwardMerit(actor, data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "학생을 선택해 주세요.",
  failureMessage: "처리하지 못했습니다.",
  onError: translateError,
});

export const cancelAction = defineFormAction<MeritActionState>()({
  schema: cancelSchema,
  input: (formData) => ({
    awardId: formData.get("awardId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ error, ok: false, count: null }),
  run: async (actor, data, formData) => {
    await service.cancelAward(actor, data);
    const studentProfileId = text(formData, "studentProfileId");
    if (studentProfileId) {
      revalidatePath(`/students/${studentProfileId}`);
      revalidatePath(`/merit/students/${studentProfileId}`);
    }
    revalidatePath("/merit");
    revalidatePath("/merit/recent");
    return { error: null, ok: true, count: null };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "취소 사유를 입력해 주세요.",
  failureMessage: "처리하지 못했습니다.",
  onError: translateError,
});

const exportTranslate = (error: unknown): string | null => {
  if (error instanceof AcademicYearError) return NO_CURRENT_YEAR_MESSAGE;
  if (error instanceof MeritError) {
    return MESSAGES[error.message] ?? EXPORT_FAILED;
  }
  return null;
};

function exportFailed(error: unknown, logLabel: string): ExportState {
  return exportErrorState(error, {
    logLabel,
    forbiddenMessage: MESSAGES.FORBIDDEN,
    translate: exportTranslate,
  });
}

export async function exportClassRosterAction(input: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = classRosterExportSchema.safeParse(input);
  if (!parsed.success) {
    return exportFailure("조회 조건을 확인해 주세요.");
  }

  try {
    return { error: null, ...(await service.exportClassRoster(actor, parsed.data)) };
  } catch (error) {
    return exportFailed(error, "상벌점 내보내기 실패:");
  }
}

export async function exportStudentHistoryAction(input: {
  studentProfileId: string;
  track: MeritTrack;
  year?: number;
}): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = studentHistoryExportSchema.safeParse(input);
  if (!parsed.success) {
    return exportFailure("조회 조건을 확인해 주세요.");
  }

  try {
    return { error: null, ...(await service.exportStudentHistory(actor, parsed.data)) };
  } catch (error) {
    return exportFailed(error, "상벌점 내역 내보내기 실패:");
  }
}

export async function exportRecentAwardsAction(
  input: RecentAwardsExportInput,
): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = recentAwardsExportSchema.safeParse(input);
  if (!parsed.success) {
    return exportFailure("조회 조건을 확인해 주세요.");
  }

  try {
    return { error: null, ...(await service.exportRecentAwards(actor, parsed.data)) };
  } catch (error) {
    return exportFailed(error, "최근 부여 내보내기 실패:");
  }
}
