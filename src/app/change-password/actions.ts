"use server";

import { headers } from "next/headers";
import { requireAuth } from "@/core/auth/session";
import { changeOwnPassword } from "@/modules/account/account.service";
import { changePasswordSchema } from "@/modules/account/account.schema";

export type ChangePasswordState = { error: string | null; ok: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  // 강제 변경 대기 상태를 푸는 유일한 경로라 이 액션은 통과해야 한다 (M12).
  const actor = await requireAuth({ allowMustChangePassword: true });

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
    };
  }

  try {
    await changeOwnPassword(actor, parsed.data, await headers());
  } catch {
    // Better Auth가 현재 비밀번호 불일치 등으로 던지는 경우.
    return { ok: false, error: "현재 비밀번호가 맞지 않습니다." };
  }

  return { ok: true, error: null };
}
