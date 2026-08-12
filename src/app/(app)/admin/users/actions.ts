"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import {
  USER_ACTION_INITIAL,
  type UpdateUserState,
  type UserActionState,
} from "./action-state";
import { updateUserSchema } from "@/modules/admin-users/admin-user.schema";
import {
  AdminUserError,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/modules/admin-users/admin-user.service";

function fail(error: string): UserActionState {
  return { error, tempPassword: null, targetId: null };
}

/** 목록과 상세가 같은 데이터를 보므로 둘 다 새로 그린다. */
function revalidate(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function setUserActiveAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";

  try {
    await setUserActive(actor, userId, active);
  } catch (error) {
    if (error instanceof AdminUserError) {
      if (error.message === "CANNOT_DEACTIVATE_SELF") {
        return fail("자기 계정은 비활성화할 수 없습니다.");
      }
      if (error.message === "NOT_FOUND") return fail("계정을 찾을 수 없습니다.");
    }
    return fail("상태를 바꾸지 못했습니다.");
  }

  revalidate(userId);
  return USER_ACTION_INITIAL;
}

export async function resetPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();
  const userId = String(formData.get("userId") ?? "");

  try {
    const { tempPassword } = await resetPassword(actor, userId);
    revalidate(userId);
    return { error: null, tempPassword, targetId: userId };
  } catch (error) {
    if (error instanceof AdminUserError) {
      if (error.message === "NO_CREDENTIAL_ACCOUNT") {
        return fail("비밀번호 로그인을 쓰지 않는 계정입니다.");
      }
      if (error.message === "NOT_FOUND") return fail("계정을 찾을 수 없습니다.");
    }
    return fail("비밀번호를 초기화하지 못했습니다.");
  }
}

// ── 정보 수정 ─────────────────────────────────────────────────

export async function updateUserAction(
  _prev: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const actor = await requireAuth();
  const userId = String(formData.get("userId") ?? "");

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    birthDate: formData.get("birthDate") ?? "",
    grade: formData.get("grade") || undefined,
    classNo: formData.get("classNo") || undefined,
    number: formData.get("number") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      changed: null,
    };
  }

  try {
    const { changed } = await updateUser(actor, userId, parsed.data);
    revalidate(userId);
    return { error: null, changed };
  } catch (error) {
    if (error instanceof AdminUserError) {
      if (error.message === "NOT_FOUND") {
        return { error: "계정을 찾을 수 없습니다.", changed: null };
      }
      if (error.message === "INCOMPLETE_STUDENT_INPUT") {
        return { error: "학년·반·번호·생년월일을 모두 채워 주세요.", changed: null };
      }
    }
    return { error: "저장하지 못했습니다.", changed: null };
  }
}
