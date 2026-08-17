"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { yearFormSchema } from "@/modules/academic-year/academic-year.schema";
import {
  applyRosterPlan,
  exportRoster,
  previewRoster,
  RosterError,
} from "@/modules/enrollment/roster.service";
import {
  confirmedDeletionIdsSchema,
  deletionCountConfirmationSchema,
  rosterRowsSchema,
} from "@/modules/enrollment/roster.schema";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  EMPTY_ROWS: "반영할 내용이 없습니다.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
  CODE_COLLISION: "초대코드가 겹쳤습니다. 다시 시도해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  // 미리보기 이후 명단에서 빠질 학생이 달라졌다. 미리보기부터 다시 해야 한다.
  DELETION_SET_CHANGED: "빠지는 학생이 달라졌습니다. 새로고침 후 다시 확인해 주세요.",
  DELETION_COUNT_MISMATCH: "빠지는 인원 수를 정확히 입력해 주세요.",
  CANNOT_DELETE_SELF: "자기 계정은 명단에서 뺄 수 없습니다.",
};

/** 파일 문제와 섞이면 관리자가 멀쩡한 파일을 계속 고치게 된다. 따로 알린다. */
const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 없습니다. 학생 관리에서 학년도를 먼저 만드세요.";

/** 파일 크기 상한. 전교생 300명이면 수십 KB면 충분하다. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function previewRosterAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const actor = await requireAuth();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택해 주세요.", year: null, rows: [], plan: null, notices: [] };
  }
  if (file.size > MAX_BYTES) {
    return { error: "파일이 너무 큽니다.", year: null, rows: [], plan: null, notices: [] };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { year, rows, plan, notices } = await previewRoster(actor, {
      filename: file.name,
      buffer,
    });
    return { error: null, year, rows, plan, notices };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, year: null, rows: [], plan: null, notices: [] };
    }
    if (error instanceof RosterError) {
      return {
        error: MESSAGES[error.message] ?? "파일을 읽지 못했습니다.",
        year: null,
        rows: [],
        plan: null,
        notices: [],
      };
    }
    return { error: "파일을 읽지 못했습니다.", year: null, rows: [], plan: null, notices: [] };
  }
}

/** 전체 명단 내보내기. 행렬만 돌려주고 xlsx는 브라우저가 만든다. */
export async function exportRosterAction(): Promise<{
  error: string | null;
  year: number | null;
  rows: (string | number | null)[][];
}> {
  const actor = await requireAuth();

  try {
    const { year, rows } = await exportRoster(actor);
    return { error: null, year, rows };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, year: null, rows: [] };
    }
    // 화면에는 일반 문구만 나가므로 여기서 안 남기면 원인이 어디에도 없다.
    console.error("명단 내보내기 실패:", error);
    return { error: "명단을 내보내지 못했습니다.", year: null, rows: [] };
  }
}

export async function applyRosterAction(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const actor = await requireAuth();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "반영할 내용을 읽지 못했습니다.", saved: null, deleted: null, excludedNew: [], invites: [] };
  }

  // 미리보기가 돌려준 값을 그대로 믿지 않는다 — 손댄 값도 여기서 막힌다.
  const rowsParsed = rosterRowsSchema.safeParse(parsedJson);
  if (!rowsParsed.success) {
    return {
      error: rowsParsed.error.issues[0]?.message ?? "반영할 내용을 확인해 주세요.",
      saved: null,
      deleted: null,
      excludedNew: [],
      invites: [],
    };
  }

  const yearParsed = yearFormSchema.safeParse({ year: formData.get("year") });
  if (!yearParsed.success) {
    return { error: "학년도가 올바르지 않습니다.", saved: null, deleted: null, excludedNew: [], invites: [] };
  }

  // 화면이 본 삭제 대상 목록. 동의 표시가 아니라 대조용이며, 진짜 강제는
  // applyRosterPlan이 다시 세운 집합과의 대조가 한다.
  let confirmedDeletionIdsJson: unknown;
  try {
    confirmedDeletionIdsJson = JSON.parse(String(formData.get("confirmedDeletionIds") ?? "[]"));
  } catch {
    return { error: "확인 정보를 읽지 못했습니다.", saved: null, deleted: null, excludedNew: [], invites: [] };
  }
  const confirmedDeletionIdsParsed = confirmedDeletionIdsSchema.safeParse(
    confirmedDeletionIdsJson,
  );
  if (!confirmedDeletionIdsParsed.success) {
    return { error: "확인 정보를 읽지 못했습니다.", saved: null, deleted: null, excludedNew: [], invites: [] };
  }

  // 빠지는 학생이 없으면 입력칸 자체가 없어 빈 문자열이 오고 스키마가 null로 접는다.
  // 그때 거부할지는 서버가 다시 세운 plan을 아는 applyRosterPlan이 정한다.
  const deletionCountParsed = deletionCountConfirmationSchema.safeParse(
    formData.get("deletionCount"),
  );
  if (!deletionCountParsed.success) {
    return {
      error: MESSAGES.DELETION_COUNT_MISMATCH,
      saved: null,
      deleted: null,
      excludedNew: [],
      invites: [],
    };
  }

  try {
    const { saved, deleted, invites, excludedNewStudents } = await applyRosterPlan(
      actor,
      yearParsed.data.year,
      rowsParsed.data,
      confirmedDeletionIdsParsed.data,
      deletionCountParsed.data,
    );
    revalidatePath("/admin/students");
    return {
      error: null,
      saved,
      deleted,
      excludedNew: excludedNewStudents,
      invites,
    };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, saved: null, deleted: null, excludedNew: [], invites: [] };
    }
    if (error instanceof RosterError) {
      return {
        error: MESSAGES[error.message] ?? "반영하지 못했습니다.",
        saved: null,
        deleted: null,
        excludedNew: [],
        invites: [],
      };
    }
    return { error: "반영하지 못했습니다.", saved: null, deleted: null, excludedNew: [], invites: [] };
  }
}
