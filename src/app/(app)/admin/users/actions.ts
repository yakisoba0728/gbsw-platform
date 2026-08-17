"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import {
  USER_ACTION_INITIAL,
  type UpdateUserState,
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

/** 서비스가 던지는 오류 코드를 화면 문구로 옮긴다. */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "권한이 없습니다.",
  NOT_FOUND: "계정을 찾을 수 없습니다.",
  ACCOUNT_DELETED: "명단에서 빠진 계정에는 할 수 없습니다.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  NO_CREDENTIAL_ACCOUNT: "비밀번호 로그인을 쓰지 않는 계정입니다.",
  CANNOT_DELETE_SELF: "자기 계정은 삭제할 수 없습니다.",
  NOT_SOFT_DELETED: "명단에서 빠진 계정만 완전 삭제할 수 있습니다.",
  NAME_MISMATCH: "이름이 일치하지 않습니다.",
  INCOMPLETE_STUDENT_INPUT: "학년·반·번호·생년월일을 모두 채워 주세요.",
  EMAIL_TAKEN: "이미 쓰이고 있는 이메일입니다.",
  NUMBER_TAKEN: "같은 반에 같은 번호가 있습니다.",
};

/** 코드로 가를 수 있는 오류는 사전에서, 나머지는 액션별 폴백으로. */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof AdminUserError || error instanceof ForbiddenError) {
    return MESSAGES[error.message] ?? fallback;
  }
  return fallback;
}

function fail(error: string): UserActionState {
  return { error, tempPassword: null, targetId: null };
}

/** 경계 검증 실패 → 화면 문구. 스키마가 문구를 갖고 있어 첫 issue를 그대로 쓴다. */
function firstIssue(
  error: { issues: { message: string }[] },
  fallback: string,
): string {
  return error.issues[0]?.message ?? fallback;
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

  const parsed = setUserActiveSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "상태를 바꾸지 못했습니다."));
  }
  const { userId, active } = parsed.data;

  try {
    await setUserActive(actor, userId, active);
  } catch (error) {
    return fail(messageFor(error, "상태를 바꾸지 못했습니다."));
  }

  revalidate(userId);
  return USER_ACTION_INITIAL;
}

export async function resetPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requireAuth();

  const parsed = userIdOnlySchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return fail(firstIssue(parsed.error, "비밀번호를 초기화하지 못했습니다."));
  }
  const { userId } = parsed.data;

  try {
    const { tempPassword } = await resetPassword(actor, userId);
    revalidate(userId);
    return { error: null, tempPassword, targetId: userId };
  } catch (error) {
    return fail(messageFor(error, "비밀번호를 초기화하지 못했습니다."));
  }
}

// ── 완전 삭제 (오등록 정리) ───────────────────────────────────

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

  // redirect()는 특수한 오류를 던져 흐름을 끊는다. try 안에 두면 위 catch가
  // 그걸 삼켜 실패로 잘못 보고한다.
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// ── 정보 수정 ─────────────────────────────────────────────────

export async function updateUserAction(
  _prev: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const actor = await requireAuth();

  const parsed = updateUserFormSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthDate: formData.get("birthDate") ?? "",
    grade: formData.get("grade") || undefined,
    classNo: formData.get("classNo") || undefined,
    number: formData.get("number") || undefined,
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "입력을 확인해 주세요."), changed: null };
  }

  // userId는 서비스가 따로 받는다. 입력 객체에 섞이면 안 된다.
  const { userId, ...input } = parsed.data;

  try {
    const { changed } = await updateUser(actor, userId, input);
    revalidate(userId);
    return { error: null, changed };
  } catch (error) {
    return { error: messageFor(error, "저장하지 못했습니다."), changed: null };
  }
}
