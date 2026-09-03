"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
import { MeritError } from "@/modules/merit/merit.error";
import {
  createRuleSchema,
  deleteRuleSchema,
  updateRuleSchema,
} from "@/modules/merit/merit.schema";
import * as service from "@/modules/merit/rule.service";
import type { RuleFormState, RuleFormValues } from "./action-state";

const MESSAGES = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
  RULE_CONFLICT: "다른 교사가 규정을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
} satisfies Record<string, string>;

function submittedValues(formData: FormData): RuleFormValues {
  return {
    kind: text(formData, "kind"),
    label: text(formData, "label"),
    points: text(formData, "points"),
    category: text(formData, "category"),
    description: text(formData, "description"),
  };
}

export const createRuleAction = defineFormAction<RuleFormState>()({
  schema: createRuleSchema,
  input: (formData) => ({
    track: formData.get("track"),
    kind: formData.get("kind"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  }),
  failState: (error, formData) => ({
    error,
    ok: false,
    values: submittedValues(formData),
  }),
  run: async (actor, data) => {
    await service.createRule(actor, data);
    revalidatePath("/admin/merit/rules");
    return { error: null, ok: true };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const updateRuleAction = defineFormAction<RuleFormState>()({
  schema: updateRuleSchema,
  input: (formData) => ({
    ruleId: formData.get("ruleId"),
    updatedAt: formData.get("updatedAt"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  }),
  failState: (error, formData) => ({
    error,
    ok: false,
    values: {
      ruleId: text(formData, "ruleId"),
      label: text(formData, "label"),
      points: text(formData, "points"),
      category: text(formData, "category"),
      description: text(formData, "description"),
    },
  }),
  run: async (actor, data) => {
    await service.updateRule(actor, data);
    revalidatePath("/admin/merit/rules");
    return { error: null, ok: true };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "처리하지 못했습니다.",
});

export const deleteRuleAction = defineFormAction<RuleFormState>()({
  schema: deleteRuleSchema,
  input: (formData) => ({
    ruleId: formData.get("ruleId"),
    updatedAt: formData.get("updatedAt"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ error, ok: false }),
  run: async (actor, data) => {
    await service.deleteRule(actor, data);
    revalidatePath("/admin/merit/rules");
    return { error: null, ok: true };
  },
  errorClass: MeritError,
  messages: MESSAGES,
  logPrefix: "[merit]",
  invalidInputMessage: "규정을 찾을 수 없습니다.",
  failureMessage: "처리하지 못했습니다.",
});
