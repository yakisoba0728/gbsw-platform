"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { firstIssue, text } from "@/lib/action-message";
import { ForbiddenError } from "@/core/authz/errors";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { yearFormSchema } from "@/modules/academic-year/academic-year.schema";
import {
  applyRosterPlan,
  exportRoster,
  previewRoster,
  RosterError,
} from "@/modules/enrollment/roster.service";
import { RosterParseError } from "@/modules/enrollment/roster.parse";
import {
  confirmedDeletionIdsSchema,
  deletionCountConfirmationSchema,
  MAX_ROSTER_ROWS,
  ROSTER_FILE_MAX_BYTES,
  rosterFingerprintSchema,
  rosterRowsSchema,
} from "@/modules/enrollment/roster.schema";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  EMPTY_ROWS: "반영할 내용이 없습니다.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
  CODE_COLLISION: "초대코드가 겹쳤습니다. 다시 시도해 주세요.",
  TOO_MANY_ROWS: `한 번에 ${MAX_ROSTER_ROWS}줄까지 올릴 수 있습니다.`,
  XLSX_TOO_LARGE: "파일이 너무 큽니다.",
  XLSX_ZIP_BOMB: "압축을 풀었을 때 너무 큰 엑셀 파일입니다.",
  XLSX_ZIP_INVALID: "엑셀 파일을 읽지 못했습니다. 새 서식으로 다시 저장해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  ROSTER_CHANGED: "미리보기 이후 명단이 바뀌었습니다. 파일을 다시 읽어 주세요.",
  PREVIEW_TOKEN_INVALID: "미리보기 정보가 바뀌었습니다. 파일을 다시 읽어 주세요.",
  DELETION_SET_CHANGED: "빠지는 학생이 달라졌습니다. 새로고침 후 다시 확인해 주세요.",
  DELETION_COUNT_MISMATCH: "빠지는 인원 수를 정확히 입력해 주세요.",
  CANNOT_DELETE_SELF: "자기 계정은 명단에서 뺄 수 없습니다.",
  NUMBER_TAKEN:
    "명단에 없는 계정이 같은 반·번호를 쓰고 있습니다. 계정 관리에서 그 계정의 반·번호를 바꾼 뒤 다시 반영해 주세요.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 없습니다. 학생 관리에서 학년도를 먼저 만드세요.";

function emptyPreview(error: string): PreviewState {
  return {
    error,
    year: null,
    rows: [],
    plan: null,
    notices: [],
    rosterFingerprint: null,
    previewToken: null,
  };
}

function applyError(error: string): ApplyState {
  return {
    error,
    saved: null,
    invitesIssued: null,
    deleted: null,
    excludedNew: [],
    invites: [],
  };
}

function sortedDeletionIds(ids: string[]): string[] {
  return [...ids].sort();
}

// 명단 서비스와 파서는 각자 자기 오류 클래스를 던진다. message 문자열로
// 일반 Error를 도메인 오류로 옮기면 우연한 일치가 오판을 만들므로
// instanceof 검사만 사용한다.
function rosterMessage(error: unknown, fallback: string): string | null {
  if (error instanceof RosterError || error instanceof RosterParseError) {
    return MESSAGES[error.message] ?? fallback;
  }
  return null;
}

export async function previewRosterAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const actor = await requireAuth();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return emptyPreview("파일을 선택해 주세요.");
  }
  if (file.size > ROSTER_FILE_MAX_BYTES) {
    return emptyPreview("파일이 너무 큽니다.");
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { year, rows, plan, notices, rosterFingerprint, previewToken } =
      await previewRoster(actor, { filename: file.name, buffer });
    return { error: null, year, rows, plan, notices, rosterFingerprint, previewToken };
  } catch (error) {
    if (error instanceof ForbiddenError) return emptyPreview("이 작업을 할 권한이 없습니다.");
    if (error instanceof AcademicYearError) {
      return emptyPreview(NO_CURRENT_YEAR_MESSAGE);
    }
    const message = rosterMessage(error, "파일을 읽지 못했습니다.");
    if (message) return emptyPreview(message);
    console.error("명단 미리보기 실패:", error);
    return emptyPreview("파일을 읽지 못했습니다.");
  }
}

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
    if (error instanceof ForbiddenError) {
      return { error: "이 작업을 할 권한이 없습니다.", year: null, rows: [] };
    }
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, year: null, rows: [] };
    }
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
    return applyError("반영할 내용을 읽지 못했습니다.");
  }

  const rowsParsed = rosterRowsSchema.safeParse(parsedJson);
  if (!rowsParsed.success) {
    return applyError(
      firstIssue(rowsParsed.error, "반영할 내용을 확인해 주세요."),
    );
  }

  const yearParsed = yearFormSchema.safeParse({ year: formData.get("year") });
  if (!yearParsed.success) {
    return applyError("학년도가 올바르지 않습니다.");
  }

  const rosterFingerprintParsed = rosterFingerprintSchema.safeParse(
    formData.get("rosterFingerprint"),
  );
  if (!rosterFingerprintParsed.success) {
    return applyError(
      firstIssue(rosterFingerprintParsed.error, MESSAGES.ROSTER_CHANGED),
    );
  }

  let confirmedDeletionIdsJson: unknown;
  try {
    confirmedDeletionIdsJson = JSON.parse(String(formData.get("confirmedDeletionIds") ?? "[]"));
  } catch {
    return applyError("확인 정보를 읽지 못했습니다.");
  }
  const confirmedDeletionIdsParsed = confirmedDeletionIdsSchema.safeParse(
    confirmedDeletionIdsJson,
  );
  if (!confirmedDeletionIdsParsed.success) {
    return applyError("확인 정보를 읽지 못했습니다.");
  }

  const deletionCountParsed = deletionCountConfirmationSchema.safeParse(
    formData.get("deletionCount"),
  );
  if (!deletionCountParsed.success) {
    return applyError(MESSAGES.DELETION_COUNT_MISMATCH);
  }

  const confirmedDeletionIds = sortedDeletionIds(confirmedDeletionIdsParsed.data);

  try {
    const {
      saved,
      invitesIssued,
      deleted,
      invites,
      excludedNewStudents,
    } = await applyRosterPlan(
      actor,
      yearParsed.data.year,
      rowsParsed.data,
      rosterFingerprintParsed.data,
      confirmedDeletionIds,
      deletionCountParsed.data,
      text(formData, "previewToken"),
    );
    revalidatePath("/admin/students");
    return {
      error: null,
      saved,
      invitesIssued,
      deleted,
      excludedNew: excludedNewStudents,
      invites,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return applyError("이 작업을 할 권한이 없습니다.");
    if (error instanceof AcademicYearError) {
      return applyError(NO_CURRENT_YEAR_MESSAGE);
    }
    const message = rosterMessage(error, "반영하지 못했습니다.");
    if (message) return applyError(message);
    console.error("명단 반영 실패:", error);
    return applyError("반영하지 못했습니다.");
  }
}
