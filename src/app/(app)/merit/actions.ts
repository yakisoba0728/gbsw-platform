"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import type { MeritTrack } from "@/core/authz/merit-track";
import { actionMessage } from "@/lib/action-message";
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

function fail(error: string, note?: string): MeritActionState {
  return { error, ok: false, count: null, note };
}

function submittedNote(formData: FormData): string {
  const raw = formData.get("note");
  return typeof raw === "string" ? raw : "";
}

function isTransactionTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2028"
  );
}

const messageFor = actionMessage(MeritError, MESSAGES, "[merit]");

function toState(error: unknown, note?: string): MeritActionState {
  if (error instanceof AcademicYearError) {
    return fail(NO_CURRENT_YEAR_MESSAGE, note);
  }
  if (isTransactionTimeout(error)) {
    console.error("[merit] 트랜잭션이 예산 안에 끝나지 않았습니다.", error);
    return fail("다른 작업이 학년도를 쓰고 있습니다. 잠시 뒤 다시 부여하세요.", note);
  }
  return fail(messageFor(error, "처리하지 못했습니다."), note);
}

export async function awardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();
  const note = submittedNote(formData);

  const parsed = awardSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "부여할 항목을 골라 주세요.", note);
  }

  try {
    await service.awardMerit(actor, parsed.data);
  } catch (error) {
    return toState(error, note);
  }

  revalidatePath(`/students/${parsed.data.studentProfileId}`);
  revalidatePath(`/merit/students/${parsed.data.studentProfileId}`);
  return { error: null, ok: true, count: 1 };
}

export async function bulkAwardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();
  const note = submittedNote(formData);

  const parsed = bulkAwardSchema.safeParse({
    studentProfileIds: formData.getAll("studentProfileIds").map(String),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "학생을 선택해 주세요.", note);
  }

  try {
    const { count } = await service.bulkAwardMerit(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error, note);
  }
}

export async function cancelAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = cancelSchema.safeParse({
    awardId: formData.get("awardId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.");
  }

  try {
    await service.cancelAward(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  if (studentProfileId) {
    revalidatePath(`/students/${studentProfileId}`);
    revalidatePath(`/merit/students/${studentProfileId}`);
  }
  revalidatePath("/merit/recent");
  return { error: null, ok: true, count: null };
}

type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

const EXPORT_FAILED = "내보내지 못했습니다.";

function toExportState(error: unknown, logLabel: string): ExportState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
  }
  if (error instanceof ForbiddenError) {
    return { error: "이 작업을 할 권한이 없습니다.", rows: [], filename: "" };
  }
  if (error instanceof MeritError) {
    return { error: MESSAGES[error.message] ?? EXPORT_FAILED, rows: [], filename: "" };
  }
  console.error(logLabel, error);
  return { error: EXPORT_FAILED, rows: [], filename: "" };
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
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportClassRoster(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "상벌점 내보내기 실패:");
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
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportStudentHistory(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "상벌점 내역 내보내기 실패:");
  }
}

export async function exportRecentAwardsAction(
  input: RecentAwardsExportInput,
): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = recentAwardsExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportRecentAwards(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "최근 부여 내보내기 실패:");
  }
}
