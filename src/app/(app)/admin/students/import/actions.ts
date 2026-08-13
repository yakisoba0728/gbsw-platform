"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { yearFormSchema } from "@/modules/academic-year/academic-year.schema";
import {
  applyRosterPlan,
  previewRoster,
  RosterError,
} from "@/modules/enrollment/roster.service";
import { rosterRowsSchema } from "@/modules/enrollment/roster.schema";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
  CODE_COLLISION: "초대코드가 겹쳤습니다. 다시 시도해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
};

/** getCurrentYear()가 던지는 AcademicYearError는 파일 문제가 아니다 — 따로 알려야
 * 관리자가 멀쩡한 파일을 계속 고치는 일이 없다. /admin/students/page.tsx와 같은 처리. */
const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 설정되어 있지 않습니다. 학생 관리에서 학년도를 먼저 만들어 주세요.";

/** 파일 크기 상한. 전교생 300명이면 수십 KB면 충분하다. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function previewRosterAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const actor = await requireAuth();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택해 주세요.", year: null, rows: [], plan: null };
  }
  if (file.size > MAX_BYTES) {
    return { error: "파일이 너무 큽니다.", year: null, rows: [], plan: null };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { year, rows, plan } = await previewRoster(actor, {
      filename: file.name,
      buffer,
    });
    return { error: null, year, rows, plan };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, year: null, rows: [], plan: null };
    }
    if (error instanceof RosterError) {
      return {
        error: MESSAGES[error.message] ?? "파일을 읽지 못했습니다.",
        year: null,
        rows: [],
        plan: null,
      };
    }
    return { error: "파일을 읽지 못했습니다.", year: null, rows: [], plan: null };
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
    return { error: "반영할 내용을 읽지 못했습니다.", saved: null, invites: [] };
  }

  // "zod 검증은 경계에서 한 번만" — 미리보기가 돌려준 값을 그대로 믿지 않는다 (I3).
  // errors를 지워 보내거나 status/grade·classNo·number 조합을 조작해도 여기서 막힌다.
  const rowsParsed = rosterRowsSchema.safeParse(parsedJson);
  if (!rowsParsed.success) {
    return {
      error: rowsParsed.error.issues[0]?.message ?? "반영할 내용을 확인해 주세요.",
      saved: null,
      invites: [],
    };
  }

  const yearParsed = yearFormSchema.safeParse({ year: formData.get("year") });
  if (!yearParsed.success) {
    return { error: "학년도가 올바르지 않습니다.", saved: null, invites: [] };
  }

  try {
    const { saved, invites } = await applyRosterPlan(
      actor,
      yearParsed.data.year,
      rowsParsed.data,
    );
    revalidatePath("/admin/students");
    return { error: null, saved, invites };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, saved: null, invites: [] };
    }
    if (error instanceof RosterError) {
      return { error: MESSAGES[error.message] ?? "반영하지 못했습니다.", saved: null, invites: [] };
    }
    return { error: "반영하지 못했습니다.", saved: null, invites: [] };
  }
}
