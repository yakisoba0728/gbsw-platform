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
import { rosterRowsSchema } from "@/modules/enrollment/roster.schema";
import type { ApplyState, PreviewState } from "./action-state";

const MESSAGES: Record<string, string> = {
  EMPTY: "읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.",
  YEAR_CHANGED: "학년도가 바뀌었습니다. 새로고침 후 다시 올려 주세요.",
  BLOCKED: "오류가 있는 줄이 남아 있습니다.",
  CODE_COLLISION: "초대코드가 겹쳤습니다. 다시 시도해 주세요.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  DELETION_NOT_CONFIRMED: "삭제 확인에 동의해야 반영할 수 있습니다.",
  CANNOT_DELETE_SELF: "자기 계정은 삭제할 수 없습니다.",
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

/**
 * 전체 명단 내려받기. 클라이언트가 write-excel-file(브라우저)로 xlsx를 직접 만들
 * 수 있도록 행렬만 돌려준다 — 서버는 파일을 만들지 않는다.
 * <form action>이 아니라 버튼 클릭에서 직접 부르므로 useActionState를 쓰지 않는다.
 */
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
    // 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나가므로
    // 여기서 흘리면 무엇이 잘못됐는지 아무 데도 남지 않는다.
    console.error("명단 내보내기 실패:", error);
    return { error: "명단을 내려받지 못했습니다.", year: null, rows: [] };
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

  // 화면의 체크박스 상태를 hidden input으로 받는다. 이건 실수를 막는 첫 방어선일
  // 뿐이다 — 서버 액션을 직접 호출하면 이 필드를 아예 안 보낼 수 있으므로,
  // 진짜 강제는 applyRosterPlan 안의 confirmDeletion 검사가 한다.
  const confirmDeletion = formData.get("confirmDeletion") === "true";

  try {
    const { saved, invites } = await applyRosterPlan(
      actor,
      yearParsed.data.year,
      rowsParsed.data,
      confirmDeletion,
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
