"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { actionMessage } from "@/lib/action-message";
import { MeritError } from "@/modules/merit/merit.error";
import { thresholdSchema } from "@/modules/merit/merit.schema";
import { setDemeritThresholds } from "@/modules/merit/threshold.service";
import type { ThresholdFormState } from "./action-state";

const MESSAGES = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  INVALID_THRESHOLD_ORDER: "위험 기준은 경고 기준보다 커야 합니다.",
  THRESHOLD_CONFLICT: "다른 교사가 기준을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
} satisfies Record<string, string>;

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

const messageFor = actionMessage(MeritError, MESSAGES, "[merit]");

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
    return fail(messageFor(error, "저장하지 못했습니다."), formData);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/merit", "layout");
  return { error: null, ok: true, values: null };
}
