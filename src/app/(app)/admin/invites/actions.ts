"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { actionMessage, text } from "@/lib/action-message";
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

export type { InviteFormState, InviteFormValues, RevokeState };

const MESSAGES = {
  FORBIDDEN: "권한이 없습니다.",
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 다시 시도해 주세요.",
  TOO_MANY_ACTIVE_INVITES: `이 학생에게 쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다.`,
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다.",
  NOT_FOUND: "코드를 찾을 수 없습니다.",
  NOT_PENDING: "이미 쓰였거나 폐기된 코드입니다.",
} satisfies Record<string, string>;

const messageFor = actionMessage(InviteError, MESSAGES, "[invite]");

function optionalDays(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return Number(raw);
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
    revalidatePath("/admin/users");
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
    revalidatePath("/admin/users");
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
    revalidatePath("/admin/users");
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
    revalidatePath("/admin/users");
    revalidatePath("/parent-invite");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: messageFor(error, "폐기하지 못했습니다.") };
  }
}
