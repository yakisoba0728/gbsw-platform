"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { MeritError } from "@/modules/merit/merit.error";
import { awardSchema, bulkAwardSchema, cancelSchema } from "@/modules/merit/merit.schema";
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
