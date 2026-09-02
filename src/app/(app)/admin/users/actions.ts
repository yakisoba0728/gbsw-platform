"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { actionMessage, firstIssue } from "@/lib/action-message";
import {
  type UpdateUserState,
  type UpdateUserValues,
  type UserActionState,
} from "./action-state";
import {
  deleteUserSchema,
  setUserActiveSchema,
  updateUserFormSchema,
  userIdOnlySchema,
} from "@/modules/admin-users/admin-user.schema";
import {
  AdminUserError,
  deleteUserPermanently,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/modules/admin-users/admin-user.service";

const MESSAGES = {
  FORBIDDEN: "권한이 없습니다.",
  NOT_FOUND: "계정을 찾을 수 없습니다.",
  ACCOUNT_DELETED: "명단에서 빠진 계정에는 할 수 없습니다.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  CANNOT_RESET_SELF: "자기 계정은 비밀번호 변경 화면에서 바꿉니다.",
  NO_CREDENTIAL_ACCOUNT: "비밀번호 로그인을 쓰지 않는 계정입니다.",
  CANNOT_DELETE_SELF: "자기 계정은 삭제할 수 없습니다.",
  DELETE_STUDENT_ONLY: "학생 계정만 삭제할 수 있습니다.",
  USER_CHANGED: "계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  YEAR_CHANGED: "현재 학년도가 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  NAME_MISMATCH: "이름이 일치하지 않습니다.",
  INCOMPLETE_STUDENT_INPUT: "학년·반·번호·생년월일을 모두 채워 주세요.",
  EMAIL_TAKEN: "이미 쓰이고 있는 이메일입니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호가 있습니다.",
} satisfies Record<string, string>;

const messageFor = actionMessage(AdminUserError, MESSAGES, "[admin-users]");

function fail(error: string): UserActionState {
  return { ok: false, error, tempPassword: null };
}

function revalidate(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function setUserActiveAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();

  const parsed = setUserActiveSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "상태를 바꾸지 못했습니다."));
  }
  const { userId, active, reason } = parsed.data;

  try {
    await setUserActive(actor, userId, active, reason);
  } catch (error) {
    return fail(messageFor(error, "상태를 바꾸지 못했습니다."));
  }

  revalidate(userId);
  return { ok: true, error: null, tempPassword: null };
}

export async function resetPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();

  const parsed = userIdOnlySchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "비밀번호를 초기화하지 못했습니다."));
  }
  const { userId, reason } = parsed.data;

  try {
    const { tempPassword } = await resetPassword(actor, userId, reason);
    revalidate(userId);
    return { ok: true, error: null, tempPassword };
  } catch (error) {
    return fail(messageFor(error, "비밀번호를 초기화하지 못했습니다."));
  }
}

export async function deleteUserPermanentlyAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();

  const parsed = deleteUserSchema.safeParse({
    userId: formData.get("userId"),
    confirmName: formData.get("confirmName"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "완전 삭제하지 못했습니다."));
  }
  const { userId, confirmName } = parsed.data;

  try {
    await deleteUserPermanently(actor, userId, confirmName);
  } catch (error) {
    return fail(messageFor(error, "완전 삭제하지 못했습니다."));
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

function submittedValues(formData: FormData): UpdateUserValues {
  const text = (name: string): string => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    birthDate: text("birthDate"),
    grade: text("grade"),
    classNo: text("classNo"),
    number: text("number"),
  };
}

export async function updateUserAction(
  _prev: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const actor = await requireAuth();

  const parsed = updateUserFormSchema.safeParse({
    userId: formData.get("userId"),
    updatedAt: formData.get("updatedAt"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthDate: formData.get("birthDate") ?? "",
    grade: formData.get("grade") || undefined,
    classNo: formData.get("classNo") || undefined,
    number: formData.get("number") || undefined,
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      error: firstIssue(parsed.error, "입력을 확인해 주세요."),
      changed: null,
      values: submittedValues(formData),
    };
  }

  const { userId, reason, ...input } = parsed.data;

  try {
    const { changed } = await updateUser(actor, userId, input, reason);
    revalidate(userId);
    return { error: null, changed, values: null };
  } catch (error) {
    return {
      error: messageFor(error, "저장하지 못했습니다."),
      changed: null,
      values: submittedValues(formData),
    };
  }
}
