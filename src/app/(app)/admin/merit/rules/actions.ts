"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { MeritError } from "@/modules/merit/merit.error";
import {
  createRuleSchema,
  deleteRuleSchema,
  updateRuleSchema,
} from "@/modules/merit/merit.schema";
import * as service from "@/modules/merit/rule.service";
import type { RuleFormState } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
};

function fail(error: string): RuleFormState {
  return { error, ok: false };
}

function toMessage(error: unknown): string {
  if (error instanceof MeritError) {
    return MESSAGES[error.message] ?? "처리하지 못했습니다.";
  }
  return "처리하지 못했습니다.";
}

export async function createRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  const parsed = createRuleSchema.safeParse({
    track: formData.get("track"),
    kind: formData.get("kind"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  try {
    await service.createRule(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}

export async function updateRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  const parsed = updateRuleSchema.safeParse({
    ruleId: formData.get("ruleId"),
    label: formData.get("label"),
    points: formData.get("points"),
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  try {
    await service.updateRule(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
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
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "규정을 찾을 수 없습니다.");
  }

  try {
    await service.deleteRule(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}
