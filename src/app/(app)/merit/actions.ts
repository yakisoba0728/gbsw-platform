"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { MERIT_TRACK_LABELS, type MeritTrack } from "@/core/authz/merit-track";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { toRosterSheet } from "@/modules/merit/merit.export";
import { MeritError } from "@/modules/merit/merit.error";
import {
  awardSchema,
  bulkAwardSchema,
  cancelSchema,
  classRosterSchema,
} from "@/modules/merit/merit.schema";
import type { MeritActionState } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
  RULE_INACTIVE: "비활성된 규정입니다. 다른 항목을 골라 주세요.",
  AWARD_NOT_FOUND: "기록을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
  ALREADY_CANCELLED: "이미 취소된 기록입니다.",
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다. 명단이 바뀌었을 수 있습니다.",
  NO_STUDENTS: "학생을 선택해 주세요.",
  TOO_MANY_STUDENTS: "한 번에 100명까지 줄 수 있습니다.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 설정되어 있지 않습니다. 학생 관리에서 학년도를 먼저 만들어 주세요.";

function toState(error: unknown): MeritActionState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, ok: false, count: null };
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

  // 학년도는 받지 않는다 — 서비스가 getCurrentYear()로 정한다.
  const parsed = awardSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "항목을 골라 주세요.",
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
      error: parsed.error.issues[0]?.message ?? "선택을 확인해 주세요.",
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

  // 어느 학생인지는 폼이 함께 보낸다 — 취소 후 그 학생 화면을 새로 그린다.
  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  if (studentProfileId) revalidatePath(`/merit/students/${studentProfileId}`);
  return { error: null, ok: true, count: null };
}

/**
 * 내보내기. 명단 내보내기와 같은 방식 — 서버는 행렬만 돌려주고
 * 클라이언트가 xlsx를 만든다. <form action>이 아니라 버튼 클릭에서 직접 부르므로
 * useActionState를 쓰지 않는다.
 */
export async function exportClassRosterAction(input: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}): Promise<{ error: string | null; rows: (string | number)[][]; filename: string }> {
  const actor = await requireAuth();

  const parsed = classRosterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    const year = parsed.data.year ?? (await getCurrentYear());
    const rows = await service.getClassRoster(actor, parsed.data);
    const sheet = toRosterSheet(rows, {
      track: parsed.data.track,
      year,
      grade: parsed.data.grade,
      classNo: parsed.data.classNo,
    });
    const trackLabel = MERIT_TRACK_LABELS[parsed.data.track];
    return {
      error: null,
      rows: sheet,
      filename: `${year}_${parsed.data.grade}학년${parsed.data.classNo}반_${trackLabel}상벌점.xlsx`,
    };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
    }
    // 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나가므로
    // 여기서 흘리면 무엇이 잘못됐는지 아무 데도 남지 않는다.
    console.error("상벌점 내보내기 실패:", error);
    return { error: "내려받지 못했습니다.", rows: [], filename: "" };
  }
}
