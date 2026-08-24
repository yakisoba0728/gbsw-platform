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

/**
 * 실패 상태에 제출값을 함께 싣는다. 저장이 거부돼도 폼은 자동 리셋되므로,
 * 이 값이 defaultValue로 되돌아가지 않으면 방금 입력한 두 숫자가 사라진다.
 */
function fail(error: string, formData: FormData): ThresholdFormState {
  const text = (name: string): string => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    error,
    ok: false,
    values: { warn: text("warn"), danger: text("danger") },
  };
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
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", formData);
  }

  try {
    await setDemeritThresholds(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error), formData);
  }

  revalidatePath("/admin/settings");
  // 기준이 바뀌면 강조·명단이 달라지는 화면도 함께 새로 그린다. layout으로
  // 지정해 그 아래 반별 화면·학생 상세까지 덮는다.
  revalidatePath("/merit", "layout");
  // 성공하면 제출값을 싣지 않는다 — 저장된 값이 서버에서 다시 내려온다.
  return { error: null, ok: true, values: null };
}
