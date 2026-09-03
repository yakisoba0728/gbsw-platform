"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defineFormAction } from "@/lib/action";
import { text } from "@/lib/action-message";
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
  NOT_SOFT_DELETED: "명단에서 빠져 삭제 표시된 계정만 완전 삭제할 수 있습니다.",
  USER_CHANGED: "계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  YEAR_CHANGED: "현재 학년도가 바뀌었습니다. 새로고침 후 다시 저장해 주세요.",
  NAME_MISMATCH: "이름이 일치하지 않습니다.",
  INCOMPLETE_STUDENT_INPUT: "학년·반·번호·생년월일을 모두 채워 주세요.",
  EMAIL_TAKEN: "이미 쓰이고 있는 이메일입니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호가 있습니다.",
} satisfies Record<string, string>;

function revalidate(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export const setUserActiveAction = defineFormAction<UserActionState>()({
  schema: setUserActiveSchema,
  input: (formData) => ({
    userId: formData.get("userId"),
    active: formData.get("active"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error, tempPassword: null }),
  run: async (actor, data) => {
    await setUserActive(actor, data.userId, data.active, data.reason);
    revalidate(data.userId);
    return { ok: true, error: null, tempPassword: null };
  },
  errorClass: AdminUserError,
  messages: MESSAGES,
  logPrefix: "[admin-users]",
  invalidInputMessage: "상태를 바꾸지 못했습니다.",
  failureMessage: "상태를 바꾸지 못했습니다.",
});

export const resetPasswordAction = defineFormAction<UserActionState>()({
  schema: userIdOnlySchema,
  input: (formData) => ({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  }),
  failState: (error) => ({ ok: false, error, tempPassword: null }),
  run: async (actor, data) => {
    const { tempPassword } = await resetPassword(actor, data.userId, data.reason);
    revalidate(data.userId);
    return { ok: true, error: null, tempPassword };
  },
  errorClass: AdminUserError,
  messages: MESSAGES,
  logPrefix: "[admin-users]",
  invalidInputMessage: "비밀번호를 초기화하지 못했습니다.",
  failureMessage: "비밀번호를 초기화하지 못했습니다.",
});

export const deleteUserPermanentlyAction = defineFormAction<UserActionState>()({
  schema: deleteUserSchema,
  input: (formData) => ({
    userId: formData.get("userId"),
    confirmName: formData.get("confirmName"),
  }),
  failState: (error) => ({ ok: false, error, tempPassword: null }),
  run: async (actor, data) => {
    await deleteUserPermanently(actor, data.userId, data.confirmName);
    revalidatePath("/admin/users");
    redirect("/admin/users");
  },
  errorClass: AdminUserError,
  messages: MESSAGES,
  logPrefix: "[admin-users]",
  invalidInputMessage: "완전 삭제하지 못했습니다.",
  failureMessage: "완전 삭제하지 못했습니다.",
});

function submittedValues(formData: FormData): UpdateUserValues {
  return {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    birthDate: text(formData, "birthDate"),
    grade: text(formData, "grade"),
    classNo: text(formData, "classNo"),
    number: text(formData, "number"),
  };
}

export const updateUserAction = defineFormAction<UpdateUserState>()({
  schema: updateUserFormSchema,
  input: (formData) => ({
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
  }),
  failState: (error, formData) => ({
    error,
    changed: null,
    values: submittedValues(formData),
  }),
  run: async (actor, data) => {
    const { userId, reason, ...input } = data;
    const { changed } = await updateUser(actor, userId, input, reason);
    revalidate(userId);
    return { error: null, changed, values: null };
  },
  errorClass: AdminUserError,
  messages: MESSAGES,
  logPrefix: "[admin-users]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "저장하지 못했습니다.",
});
