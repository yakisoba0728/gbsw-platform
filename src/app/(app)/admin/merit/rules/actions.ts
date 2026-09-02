"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { actionMessage, text } from "@/lib/action-message";
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

function fail(error: string, values?: RuleFormValues): RuleFormState {
  return { error, ok: false, values };
}

const messageFor = actionMessage(MeritError, MESSAGES, "[merit]");

export async function createRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  const values: RuleFormValues = {
    kind: text(formData, "kind"),
    label: text(formData, "label"),
    points: text(formData, "points"),
    category: text(formData, "category"),
    description: text(formData, "description"),
  };

  const parsed = createRuleSchema.safeParse({
    track: formData.get("track"),
    kind: formData.get("kind"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", values);
  }

  try {
    await service.createRule(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), values);
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}

export async function updateRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  const values: RuleFormValues = {
    ruleId: text(formData, "ruleId"),
    label: text(formData, "label"),
    points: text(formData, "points"),
    category: text(formData, "category"),
    description: text(formData, "description"),
  };

  const parsed = updateRuleSchema.safeParse({
    ruleId: formData.get("ruleId"),
    updatedAt: formData.get("updatedAt"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.", values);
  }

  try {
    await service.updateRule(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."), values);
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}

export async function deleteRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  const parsed = deleteRuleSchema.safeParse({
    ruleId: formData.get("ruleId"),
    updatedAt: formData.get("updatedAt"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "규정을 찾을 수 없습니다.");
  }

  try {
    await service.deleteRule(actor, parsed.data);
  } catch (error) {
    return fail(messageFor(error, "처리하지 못했습니다."));
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}
