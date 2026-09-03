"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { defineFormAction } from "@/lib/action";
import {
  changeOwnPassword,
  InvalidCurrentPasswordError,
} from "@/modules/account/account.service";
import { changePasswordSchema } from "@/modules/account/account.schema";

export type ChangePasswordState = { error: string | null; ok: boolean };

export const changePasswordAction = defineFormAction<ChangePasswordState>()({
  schema: changePasswordSchema,
  input: (formData) => ({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  }),
  failState: (error) => ({ ok: false, error }),
  run: async (actor, data) => {
    await changeOwnPassword(actor, data, await headers());
    redirect("/login?passwordChanged=1");
  },
  requireAuthOptions: { allowMustChangePassword: true },
  onError: (error) =>
    error instanceof InvalidCurrentPasswordError
      ? "현재 비밀번호가 맞지 않습니다."
      : null,
  errorClass: InvalidCurrentPasswordError,
  messages: { FORBIDDEN: "이 작업을 할 권한이 없습니다." },
  logPrefix: "[account]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "비밀번호를 변경하지 못했습니다.",
});
