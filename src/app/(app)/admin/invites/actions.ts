"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { formatInviteCode } from "@/lib/invite-code";
import {
  createAdminInviteSchema,
  createParentInviteForSchema,
  createStudentInviteSchema,
  revokeInviteSchema,
} from "@/modules/invites/invite.schema";
import {
  createAdminInvite,
  createParentInviteFor,
  createStudentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} from "@/modules/invites/invite.service";
import type {
  InviteFormState,
  InviteFormValues,
  RevokeState,
} from "./action-state";

/** 화면이 `./actions`에서 가져가던 경로를 유지한다. 값은 action-state.ts에 있다. */
export type { InviteFormState, InviteFormValues, RevokeState };

/** 서비스가 던지는 오류 코드를 화면 문구로 옮긴다. */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "권한이 없습니다.",
  // 유일한 코드를 뽑지 못했다 — 일시적 장애라 다시 누르면 풀린다.
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 다시 시도해 주세요.",
  TOO_MANY_ACTIVE_INVITES: `이 학생에게 쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다.`,
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다.",
  NOT_FOUND: "코드를 찾을 수 없습니다.",
  NOT_PENDING: "이미 쓰였거나 폐기된 코드입니다.",
};

/** 코드로 가를 수 있는 오류는 사전에서, 나머지는 액션별 폴백으로. */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof InviteError || error instanceof ForbiddenError) {
    return MESSAGES[error.message] ?? fallback;
  }
  // 예상 못 한 오류는 서버 콘솔에 남긴다. 화면에는 일반 문구만 나가므로
  // 여기서 안 남기면 원인이 어디에도 없다.
  console.error("[invite] 예상 못 한 오류", error);
  return fallback;
}

function optionalDays(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return Number(raw);
}

/**
 * 폼이 보낸 문자열 그대로. 실패 상태에 실어 되돌려 줄 값이라 다듬지 않는다 —
 * React 19가 액션이 끝난 폼을 리셋하므로 이것이 없으면 입력이 통째로 사라진다.
 */
function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

export async function createStudentInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const values: InviteFormValues = {
    name: text(formData, "name"),
    birthDate: text(formData, "birthDate"),
    grade: text(formData, "grade"),
    classNo: text(formData, "classNo"),
    number: text(formData, "number"),
    expiresInDays: text(formData, "expiresInDays"),
  };

  const parsed = createStudentInviteSchema.safeParse({
    name: formData.get("name"),
    birthDate: formData.get("birthDate"),
    grade: Number(formData.get("grade")),
    classNo: Number(formData.get("classNo")),
    number: Number(formData.get("number")),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      code: null,
      values,
    };
  }

  try {
    const invite = await createStudentInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return {
      error: messageFor(error, "코드를 발급하지 못했습니다."),
      code: null,
      values,
    };
  }
}

export async function createAdminInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const values: InviteFormValues = {
    name: text(formData, "name"),
    expiresInDays: text(formData, "expiresInDays"),
  };

  const parsed = createAdminInviteSchema.safeParse({
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      code: null,
      values,
    };
  }

  try {
    const invite = await createAdminInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return {
      error: messageFor(error, "코드를 발급하지 못했습니다."),
      code: null,
      values,
    };
  }
}

export async function createParentInviteForAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  // 6줄짜리 목록에서 학생을 다시 찾는 것이 이 폼에서 가장 비싼 재입력이다.
  const values: InviteFormValues = {
    studentId: text(formData, "studentId"),
    name: text(formData, "name"),
    expiresInDays: text(formData, "expiresInDays"),
  };

  const parsed = createParentInviteForSchema.safeParse({
    studentId: formData.get("studentId"),
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      code: null,
      values,
    };
  }

  try {
    const invite = await createParentInviteFor(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return {
      error: messageFor(error, "코드를 발급하지 못했습니다."),
      code: null,
      values,
    };
  }
}

export async function revokeInviteAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const actor = await requireAuth();

  const parsed = revokeInviteSchema.safeParse({
    inviteId: formData.get("inviteId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  try {
    await revokeInvite(actor, parsed.data);
    // 교사 목록과 학생의 학부모 코드 목록 양쪽에서 쓰인다.
    revalidatePath("/admin/invites");
    revalidatePath("/parent-invite");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: messageFor(error, "폐기하지 못했습니다.") };
  }
}
