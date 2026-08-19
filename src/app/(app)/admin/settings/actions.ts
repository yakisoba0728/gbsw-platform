"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { MeritError } from "@/modules/merit/merit.error";
import { thresholdSchema } from "@/modules/merit/merit.schema";
import { setDemeritThresholds } from "@/modules/merit/threshold.service";
import type { ThresholdFormState } from "./action-state";

/** 서비스가 던지는 오류 코드를 화면 문구로 옮긴다. */
const MESSAGES: Record<string, string> = {
  INVALID_THRESHOLD_ORDER: "위험 기준은 경고 기준보다 커야 합니다.",
  THRESHOLD_CONFLICT: "다른 관리자가 기준을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
};

function fail(error: string): ThresholdFormState {
  return { error, ok: false };
}

function toMessage(error: unknown): string {
  if (error instanceof MeritError) {
    return MESSAGES[error.message] ?? "저장하지 못했습니다.";
  }
  return "저장하지 못했습니다.";
}

export async function saveThresholdAction(
  _prev: ThresholdFormState,
  formData: FormData,
): Promise<ThresholdFormState> {
  const actor = await requireAuth();

  const parsed = thresholdSchema.safeParse({
    track: formData.get("track"),
    updatedAt: formData.get("updatedAt"),
    warn: formData.get("warn"),
    danger: formData.get("danger"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  try {
    await setDemeritThresholds(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath("/admin/settings");
  // 기준이 바뀌면 강조·명단이 달라지는 화면도 함께 새로 그린다. layout으로
  // 지정해 그 아래 반별 화면·학생 상세까지 덮는다.
  revalidatePath("/merit", "layout");
  return { error: null, ok: true };
}
