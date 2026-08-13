"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import {
  EnrollmentError,
  saveEnrollments,
} from "@/modules/enrollment/enrollment.service";
import { saveEnrollmentsSchema } from "@/modules/enrollment/enrollment.schema";
import type { SaveState } from "./action-state";

const MESSAGES: Record<string, string> = {
  UNKNOWN_STUDENT: "목록에 없는 학생이 포함됐습니다. 새로고침 후 다시 시도하세요.",
  INCOMPLETE_ENROLLED: "재학인 학생은 학년·반·번호를 모두 채워야 합니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호의 학생이 있습니다.",
};

export async function saveEnrollmentsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const actor = await requireAuth();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(formData.get("changes") ?? "[]"));
  } catch {
    return { error: "저장할 내용을 읽지 못했습니다.", saved: null };
  }

  const parsed = saveEnrollmentsSchema.safeParse({ changes: parsedJson });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      saved: null,
    };
  }

  try {
    const { saved } = await saveEnrollments(actor, parsed.data.changes);
    revalidatePath("/admin/students");
    return { error: null, saved };
  } catch (error) {
    if (error instanceof EnrollmentError) {
      return { error: MESSAGES[error.message] ?? "저장하지 못했습니다.", saved: null };
    }
    return { error: "저장하지 못했습니다.", saved: null };
  }
}
