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
import { updateUserSchema } from "@/modules/admin-users/admin-user.schema";
import {
  AdminUserError,
  deleteUserPermanently,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/modules/admin-users/admin-user.service";

/**
 * 서비스가 던지는 오류 코드 → 화면 문구.
 *
 * CLAUDE.md의 오류 규약대로 코드를 문구로 옮기는 일은 액션이 맡는다 —
 * admin/students·import·merit의 MESSAGES와 같은 방식이다. 예전엔 이 파일만
 * if 체인이라 같은 문구가 액션마다 복붙돼 있었다.
 *
 * `FORBIDDEN`(ForbiddenError)도 여기서 받는다. 예전엔 마지막 폴백이 권한 거부를
 * "상태를 바꾸지 못했습니다" 같은 장애 문구로 덮어, 감사로그에는 authz:denied가
 * 정확히 남는데 화면만 다른 원인을 가리켰다 — core/authz/errors.ts가
 * "권한 침해 시도와 일시적 장애가 똑같이 보였다"고 지적한 그 문제다.
 */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  NOT_FOUND: "계정을 찾을 수 없습니다.",
  /*
   * 세 액션(상태 변경·비밀번호 초기화·정보 수정)이 이 코드를 공유한다. 예전엔
   * 액션마다 뒷문장만 달랐는데("상태를 바꿀 수 없습니다" / "비밀번호를 초기화할
   * 수 없습니다" / "정보를 수정할 수 없습니다"), 사전으로 모으면서 어느
   * 작업에서 와도 맞는 한 문장으로 합쳤다.
   */
  ACCOUNT_DELETED: "명단에서 빠진 계정이라 이 작업을 할 수 없습니다.",
  CANNOT_DEACTIVATE_SELF: "자기 계정은 비활성화할 수 없습니다.",
  NO_CREDENTIAL_ACCOUNT: "비밀번호 로그인을 쓰지 않는 계정입니다.",
  CANNOT_DELETE_SELF: "자기 계정은 삭제할 수 없습니다.",
  NOT_SOFT_DELETED: "먼저 명단에서 빠진(소프트 삭제된) 계정만 완전 삭제할 수 있습니다.",
  NAME_MISMATCH: "입력한 이름이 일치하지 않습니다.",
  INCOMPLETE_STUDENT_INPUT: "학년·반·번호·생년월일을 모두 채워 주세요.",
  EMAIL_TAKEN: "이미 사용 중인 이메일입니다.",
  NUMBER_TAKEN: "이미 그 반에 같은 번호의 학생이 있습니다.",
};

/**
 * 코드로 가를 수 있는 오류는 사전에서, 나머지(DB 장애 등)는 액션별 폴백으로.
 * 폴백은 액션마다 다르다 — "무엇을 못 했는지"는 사전이 알 수 없다.
 */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof AdminUserError || error instanceof ForbiddenError) {
    return MESSAGES[error.message] ?? fallback;
  }
  return fallback;
}

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
  const userId = String(formData.get("userId") ?? "");

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
  const userId = String(formData.get("userId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");

  try {
    await deleteUserPermanently(actor, userId, confirmName);
  } catch (error) {
    return fail(messageFor(error, "완전히 삭제하지 못했습니다."));
  }

  // 이 상세 페이지 자체가 지워진 사용자를 가리키므로 더 볼 게 없다 —
  // 목록으로 돌려보낸다. try/catch 밖에서 불러야 한다 — redirect()는 내부적으로
  // 특수한 오류를 던져 흐름을 끊는데, try 안에 있으면 위 catch가 그걸 삼켜
  // "완전히 삭제하지 못했습니다"로 잘못 보고한다.
  revalidatePath("/admin/users");
  redirect("/admin/users");
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
    email: formData.get("email"),
    phone: formData.get("phone"),
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
    return { error: messageFor(error, "저장하지 못했습니다."), changed: null };
  }
}
