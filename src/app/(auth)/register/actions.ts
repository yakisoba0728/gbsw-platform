"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { firstIssue, text } from "@/lib/action-message";
import type { Role } from "@/core/authz/roles";
import {
  type BootstrapInput,
  bootstrapSchema,
} from "@/modules/bootstrap/bootstrap.schema";
import { createInitialAdmin } from "@/modules/bootstrap/bootstrap.service";
import { signInSilently } from "@/modules/auth/auth.service";
import {
  completeRegistrationSchema,
  inviteCodeSchema,
} from "@/modules/registration/registration.schema";
import {
  checkInvite,
  completeRegistration,
  RegistrationError,
  requestVerification,
} from "@/modules/registration/registration.service";
import {
  confirmCodeSchema,
  requestCodeSchema,
} from "@/modules/verification/verification.schema";
import {
  confirmCode,
  VerificationError,
} from "@/modules/verification/verification.service";

// React의 폼 초기화 후 실패 입력을 복원하되 비밀번호는 반환하지 않는다.
export type BootstrapState = {
  error: string | null;
  values: { name: string; email: string; phone: string };
};

export async function createInitialAdminAction(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  const token = text(formData, "token");

  const values = {
    name: text(formData, "name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
  };

  const parsed = bootstrapSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  } satisfies Record<keyof BootstrapInput, FormDataEntryValue | null>);

  if (!parsed.success) {
    return {
      error: firstIssue(parsed.error, "입력을 확인해 주세요."),
      values,
    };
  }

  try {
    await createInitialAdmin(token, parsed.data);
  } catch {
    return { error: "교사 계정을 만들 수 없습니다.", values };
  }

  const signedIn = await signInSilently(
    parsed.data.email,
    parsed.data.password,
    headers(),
  );
  // 자동 로그인이 실패하면 홈이 아니라 안내 문구가 있는 로그인 화면으로 보낸다.
  redirect(signedIn ? "/" : "/login?loginError=server");
}

export type CheckInviteState = {
  code: string | null;
  role: Role | null;
  error: string | null;
  values?: { code: string };
};

export async function checkInviteAction(
  _prev: CheckInviteState,
  formData: FormData,
): Promise<CheckInviteState> {
  const values = { code: text(formData, "code") };
  const parsed = inviteCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) {
    return {
      code: null,
      role: null,
      error: "가입코드를 입력해 주세요.",
      values,
    };
  }

  try {
    const { role } = await checkInvite(parsed.data);
    return { code: parsed.data, role, error: null };
  } catch (error) {
    if (error instanceof RegistrationError) {
      return { code: null, role: null, error: error.message, values };
    }
    console.error("[registration] 가입코드를 확인하지 못했습니다.", error);
    return {
      code: null,
      role: null,
      error: "쓸 수 없는 가입코드입니다.",
      values,
    };
  }
}

export type RegisterState = {
  error: string | null;
  values: { name: string; birthDate: string };
};

export async function completeRegistrationAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const values = {
    name: text(formData, "name"),
    birthDate: text(formData, "birthDate"),
  };

  const parsed = completeRegistrationSchema.safeParse({
    code: formData.get("code"),
    emailChallengeId: formData.get("emailChallengeId"),
    phoneChallengeId: formData.get("phoneChallengeId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    birthDate: formData.get("birthDate") ?? "",
  });

  if (!parsed.success) {
    return {
      error: firstIssue(parsed.error, "입력을 확인해 주세요."),
      values,
    };
  }

  try {
    await completeRegistration(parsed.data);
  } catch (error) {
    if (error instanceof RegistrationError || error instanceof VerificationError) {
      return { error: error.message, values };
    }
    console.error("[registration] 가입하지 못했습니다.", error);
    return { error: "가입하지 못했습니다.", values };
  }

  const signedIn = await signInSilently(
    parsed.data.email,
    parsed.data.password,
    headers(),
  );
  // 자동 로그인이 실패하면 홈이 아니라 안내 문구가 있는 로그인 화면으로 보낸다.
  redirect(signedIn ? "/" : "/login?loginError=server");
}

export type VerifyResult = {
  ok: boolean;
  error: string | null;
  verified?: boolean;
  /* 확인 단계가 대상값 대신 들고 가는 손잡이. 발급 응답으로만 나간다. */
  challengeId?: string;
  mockCode?: string;
};

export async function requestVerificationAction(
  channel: string,
  target: string,
  code: string,
): Promise<VerifyResult> {
  const parsedCode = inviteCodeSchema.safeParse(code);
  const parsed = requestCodeSchema.safeParse({ channel, target });
  if (!parsedCode.success || !parsed.success) {
    return { ok: false, error: "형식을 확인해 주세요." };
  }

  try {
    const result = await requestVerification(
      parsedCode.data,
      parsed.data.channel,
      parsed.data.target,
    );
    return { ok: true, error: null, verified: false, ...result };
  } catch (error) {
    if (error instanceof VerificationError || error instanceof RegistrationError) {
      return { ok: false, error: error.message };
    }
    console.error("[verification] 인증번호를 보내지 못했습니다.", error);
    return { ok: false, error: "인증번호를 보내지 못했습니다." };
  }
}

export async function confirmVerificationAction(
  challengeId: string,
  code: string,
): Promise<VerifyResult> {
  const parsed = confirmCodeSchema.safeParse({ challengeId, code });
  if (!parsed.success) {
    return {
      ok: false,
      error: firstIssue(parsed.error, "입력을 확인해 주세요."),
    };
  }

  try {
    await confirmCode(parsed.data.challengeId, parsed.data.code);
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof VerificationError) {
      return { ok: false, error: error.message };
    }
    console.error("[verification] 인증하지 못했습니다.", error);
    return { ok: false, error: "인증하지 못했습니다." };
  }
}
