"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import {
  applyRosterPlan,
  previewRoster,
  RosterError,
} from "@/modules/enrollment/roster.service";
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
};

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

  let rows: RosterRow[];
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "반영할 내용을 읽지 못했습니다.", saved: null, invites: [] };
  }
  const year = Number(formData.get("year"));

  try {
    const { saved, invites } = await applyRosterPlan(actor, year, rows);
    revalidatePath("/admin/students");
    return { error: null, saved, invites };
  } catch (error) {
    if (error instanceof RosterError) {
      return { error: MESSAGES[error.message] ?? "반영하지 못했습니다.", saved: null, invites: [] };
    }
    return { error: "반영하지 못했습니다.", saved: null, invites: [] };
  }
}
