"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import type { MeritTrack } from "@/core/authz/merit-track";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { MeritError } from "@/modules/merit/merit.error";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelBatchSchema,
  cancelSchema,
  classRosterSchema,
  studentHistoryExportSchema,
} from "@/modules/merit/merit.schema";
import type { MeritActionState } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
  // 화면은 규정을 "삭제"로 부른다 — 여기만 "비활성"이면 겪은 적 없는 상태가 된다.
  RULE_INACTIVE: "삭제된 규정입니다.",
  AWARD_NOT_FOUND: "기록을 찾을 수 없습니다.",
  ALREADY_CANCELLED: "이미 취소된 기록입니다.",
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다.",
  NO_STUDENTS: "학생을 선택해 주세요.",
  BATCH_NOT_FOUND: "취소할 묶음을 찾을 수 없습니다.",
  TOO_MANY_STUDENTS: `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`,
  OCCURRED_OUT_OF_YEAR: "현재 학년도 안의 날짜만 고를 수 있습니다.",
  OCCURRED_IN_FUTURE: "오늘까지의 날짜만 고를 수 있습니다.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 없습니다. 학생 관리에서 학년도를 먼저 만드세요.";

function toState(error: unknown): MeritActionState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, ok: false, count: null };
  }
  // 권한 거부를 일반 폴백에 섞지 않는다. 화면이 "처리하지 못했습니다"라고 하면
  // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
  if (error instanceof ForbiddenError) {
    return { error: "이 작업을 할 권한이 없습니다.", ok: false, count: null };
  }
  if (error instanceof MeritError) {
    return { error: MESSAGES[error.message] ?? "처리하지 못했습니다.", ok: false, count: null };
  }
  return { error: "처리하지 못했습니다.", ok: false, count: null };
}

export async function awardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  // 학년도도 발생일도 받지 않는다 — 서비스가 정한다.
  const parsed = awardSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "부여할 항목을 골라 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    await service.awardMerit(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/merit/students/${parsed.data.studentProfileId}`);
  return { error: null, ok: true, count: 1 };
}

export async function bulkAwardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = bulkAwardSchema.safeParse({
    // 체크박스는 같은 name으로 여러 개 온다.
    studentProfileIds: formData.getAll("studentProfileIds").map(String),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "학생을 선택해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    const { count } = await service.bulkAwardMerit(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error);
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
    return {
      error: parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    await service.cancelAward(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  // 어느 학생인지는 폼이 함께 보낸다 — 취소 후 그 학생 화면을 다시 그린다.
  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  if (studentProfileId) revalidatePath(`/merit/students/${studentProfileId}`);
  return { error: null, ok: true, count: null };
}

/** 묶음 통째로 취소. 일괄 부여를 잘못했을 때 한 번에 되돌린다. */
export async function cancelBatchAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = cancelBatchSchema.safeParse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    const { count } = await service.cancelBatch(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error);
  }
}

/**
 * 내보내기 결과. 서버는 행렬만 돌려주고 클라이언트(export-button.tsx)가
 * write-excel-file/browser로 xlsx를 만든다.
 */
type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

const EXPORT_FAILED = "내보내지 못했습니다.";

/** 내보내기 실패의 오류 → 화면 문구. toState와 같은 일을 하되 반환 모양이 다르다. */
function toExportState(error: unknown, logLabel: string): ExportState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
  }
  // toState와 같은 이유로 권한 거부를 갈라낸다 — 폴백으로 떨어지면 정상적인
  // 거부가 서버 로그에서 예상 못 한 오류처럼 보인다.
  if (error instanceof ForbiddenError) {
    return { error: "이 작업을 할 권한이 없습니다.", rows: [], filename: "" };
  }
  if (error instanceof MeritError) {
    return { error: MESSAGES[error.message] ?? EXPORT_FAILED, rows: [], filename: "" };
  }
  // 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나간다.
  console.error(logLabel, error);
  return { error: EXPORT_FAILED, rows: [], filename: "" };
}

/** 반별 목록 내보내기. 시트 조립·파일명은 서비스가 만든다. */
export async function exportClassRosterAction(input: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = classRosterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportClassRoster(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "상벌점 내보내기 실패:");
  }
}

/** 한 학생의 내역 내보내기. 조회 범위는 서비스가 트랙 규칙대로 정한다. */
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
