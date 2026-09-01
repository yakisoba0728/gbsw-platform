"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { MeritError } from "@/modules/merit/merit.error";
import {
  createRuleSchema,
  deleteRuleSchema,
  updateRuleSchema,
} from "@/modules/merit/merit.schema";
import * as service from "@/modules/merit/rule.service";
import type { RuleFormState, RuleFormValues } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
  RULE_CONFLICT: "다른 교사가 규정을 바꿨습니다. 새로고침 후 다시 저장해 주세요.",
};

/**
 * 실패 상태에는 제출값을 함께 싣는다 — React 19가 액션이 끝난 폼을 리셋하므로
 * 이 값이 없으면 화면이 오류만 보여 주고 입력은 지워 버린다.
 */
function fail(error: string, values?: RuleFormValues): RuleFormState {
  return { error, ok: false, values };
}

/** 폼이 보낸 문자열 그대로. 되돌려 줄 값이라 다듬지 않는다 — 다듬으면 커서가 튄다. */
function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function toMessage(error: unknown): string {
  // 권한 거부를 일반 폴백에 섞지 않는다 — 화면이 「처리하지 못했습니다」라고 하면
  // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
  if (error instanceof ForbiddenError) return "이 작업을 할 권한이 없습니다.";
  if (error instanceof MeritError) {
    return MESSAGES[error.message] ?? "처리하지 못했습니다.";
  }
  // 예상 못 한 오류는 서버 콘솔에 남긴다. 화면에는 일반 문구만 나가므로
  // 여기서 안 남기면 원인이 어디에도 없다.
  console.error("[merit] 예상 못 한 오류", error);
  return "처리하지 못했습니다.";
}

export async function createRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  // track은 지금 보고 있는 탭이 정한다 — 폼이 되찾을 값이 아니라 되싣지 않는다.
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
    return fail(toMessage(error), values);
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}

export async function updateRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  // ruleId를 함께 실어야 표가 어느 행에 값을 되돌릴지 안다.
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
    return fail(toMessage(error), values);
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}

export async function deleteRuleAction(
  _prev: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const actor = await requireAuth();

  // 삭제는 제출값을 되싣지 않는다 — 사유 칸은 ConfirmDialog가 소유한 모달 안에 있다.
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
    return fail(toMessage(error));
  }

  revalidatePath("/admin/merit/rules");
  return { error: null, ok: true };
}
