"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
import { MeritError } from "@/modules/merit/merit.error";
import { thresholdSchema } from "@/modules/merit/merit.schema";
import { setDemeritThresholds } from "@/modules/merit/threshold.service";
import type { ThresholdFormState } from "./action-state";

const MESSAGES = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  INVALID_THRESHOLD_ORDER: "위험 기준은 경고 기준보다 커야 합니다.",
  THRESHOLD_CONFLICT: "다른 교사가 기준을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
} satisfies Record<string, string>;

export const saveThresholdAction = defineFormAction<ThresholdFormState>()({
  schema: thresholdSchema,
  input: (formData) => ({
    track: formData.get("track"),
    updatedAt: formData.get("updatedAt"),
    warn: formData.get("warn"),
    danger: formData.get("danger"),
  }),
  failState: (error, formData) => ({
    error,
    ok: false,
    values: { warn: text(formData, "warn"), danger: text(formData, "danger") },
  }),
  run: async (actor, data) => {
    await setDemeritThresholds(actor, data);
    revalidatePath("/admin/settings");
    revalidatePath("/merit", "layout");
    return { error: null, ok: true, values: null };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "저장하지 못했습니다.",
});
