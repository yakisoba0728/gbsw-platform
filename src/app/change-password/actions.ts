"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "@/core/auth/session";
import {
  changeOwnPassword,
  InvalidCurrentPasswordError,
} from "@/modules/account/account.service";
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
  } catch (error) {
    if (!(error instanceof InvalidCurrentPasswordError)) {
      console.error("[account] password change failed", error);
      return {
        ok: false,
        error: "비밀번호를 변경하지 못했습니다.",
      };
    }
    return { ok: false, error: "현재 비밀번호가 맞지 않습니다." };
  }

  redirect("/login?passwordChanged=1");
}
