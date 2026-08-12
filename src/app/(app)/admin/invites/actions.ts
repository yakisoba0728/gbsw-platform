"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { formatInviteCode } from "@/lib/invite-code";
import {
  createAdminInviteSchema,
  createParentInviteForSchema,
  createStudentInviteSchema,
} from "@/modules/invites/invite.schema";
import {
  createAdminInvite,
  createParentInviteFor,
  createStudentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} from "@/modules/invites/invite.service";

export type InviteFormState = {
  error: string | null;
  /** 발급 성공 시 화면에 한 번 보여줄 코드 */
  code: string | null;
};

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
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createStudentInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch {
    return { error: "코드를 발급하지 못했습니다.", code: null };
  }
}

export async function createAdminInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const parsed = createAdminInviteSchema.safeParse({
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createAdminInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch {
    return { error: "코드를 발급하지 못했습니다.", code: null };
  }
}

export async function createParentInviteForAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const parsed = createParentInviteForSchema.safeParse({
    studentId: formData.get("studentId"),
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createParentInviteFor(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    if (error instanceof InviteError) {
      if (error.message === "TOO_MANY_ACTIVE_INVITES") {
        return {
          error: `이 학생에게 아직 쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다.`,
          code: null,
        };
      }
      if (error.message === "STUDENT_NOT_FOUND") {
        return { error: "해당 학생을 찾을 수 없습니다.", code: null };
      }
    }
    return { error: "코드를 발급하지 못했습니다.", code: null };
  }
}

export type RevokeState = { error: string | null };

export async function revokeInviteAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const actor = await requireAuth();
  const inviteId = String(formData.get("inviteId") ?? "");

  try {
    await revokeInvite(actor, inviteId);
    // 이 액션은 관리자 목록과 학생의 학부모 코드 목록 양쪽에서 쓰인다.
    revalidatePath("/admin/invites");
    revalidatePath("/parent-invite");
    return { error: null };
  } catch {
    return { error: "폐기하지 못했습니다. 이미 사용되었거나 폐기된 코드입니다." };
  }
}
