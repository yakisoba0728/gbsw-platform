"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth/auth";
import type { Role } from "@/core/authz/roles";
import {
  type BootstrapInput,
  bootstrapSchema,
} from "@/modules/bootstrap/bootstrap.schema";
import { createInitialAdmin } from "@/modules/bootstrap/bootstrap.service";
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

// ── 최초 관리자 부트스트랩 ─────────────────────────────────────

export type BootstrapState = { error: string | null };

export async function createInitialAdminAction(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  const token = String(formData.get("token") ?? "");

  // 토큰 소진보다 먼저 검증한다 — 입력 오타로 토큰이 날아가면 안 된다.
  // `satisfies`가 스키마의 키를 전부 읽었는지 컴파일 타임에 못 박는다.
  const parsed = bootstrapSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  } satisfies Record<keyof BootstrapInput, FormDataEntryValue | null>);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  }

  try {
    await createInitialAdmin(token, parsed.data);
  } catch {
    // 토큰 불일치인지 이미 설정됐는지 구분해 알리지 않는다.
    return { error: "관리자 계정을 만들 수 없습니다." };
  }

  await signInSilently(parsed.data.email, parsed.data.password);
  redirect("/");
}

// ── 초대코드 가입 ─────────────────────────────────────────────

export type CheckInviteState = {
  code: string | null;
  role: Role | null;
  error: string | null;
};

export async function checkInviteAction(
  _prev: CheckInviteState,
  formData: FormData,
): Promise<CheckInviteState> {
  const parsed = inviteCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) {
    return { code: null, role: null, error: "가입코드를 입력해 주세요." };
  }

  try {
    const { role } = await checkInvite(parsed.data);
    return { code: parsed.data, role, error: null };
  } catch {
    return { code: null, role: null, error: "쓸 수 없는 가입코드입니다." };
  }
}

export type RegisterState = { error: string | null };

export async function completeRegistrationAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = completeRegistrationSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    birthDate: formData.get("birthDate") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  }

  try {
    await completeRegistration(parsed.data);
  } catch (error) {
    // 우리가 문구를 정제해 둔 오류만 그대로 보여준다. 그 밖(Prisma 원문 등)은 덮는다.
    return {
      error:
        error instanceof RegistrationError || error instanceof VerificationError
          ? error.message
          : "가입하지 못했습니다.",
    };
  }

  await signInSilently(parsed.data.email, parsed.data.password);
  redirect("/");
}

// ── 이메일 · 휴대폰 인증 ──────────────────────────────────────
//
// 가입 폼 "안"에서 쓰인다. HTML은 폼 중첩을 허용하지 않아 인수를 그대로 받는다.

export type VerifyResult = {
  ok: boolean;
  error: string | null;
  /** 목업 모드에서만 채워진다. 운영에서는 언제나 undefined. */
  mockCode?: string;
};

/** 가입코드를 함께 받는다 (I4) — 코드 보유자만 발송을 촉발할 수 있게 한다. */
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
    const { mockCode } = await requestVerification(
      parsedCode.data,
      parsed.data.channel,
      parsed.data.target,
    );
    return { ok: true, error: null, mockCode };
  } catch (error) {
    // 서비스가 정제한 문구만 내보낸다. 그 밖의 오류는 원문을 감춘다.
    return {
      ok: false,
      error:
        error instanceof VerificationError || error instanceof RegistrationError
          ? error.message
          : "인증번호를 보내지 못했습니다.",
    };
  }
}

export async function confirmVerificationAction(
  channel: string,
  target: string,
  code: string,
): Promise<VerifyResult> {
  const parsed = confirmCodeSchema.safeParse({ channel, target, code });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
    };
  }

  try {
    await confirmCode(parsed.data.channel, parsed.data.target, parsed.data.code);
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof VerificationError
          ? error.message
          : "인증하지 못했습니다.",
    };
  }
}

/** 방금 만든 계정으로 바로 로그인시킨다. 실패해도 가입 자체는 성공이라 삼킨다. */
async function signInSilently(email: string, password: string): Promise<void> {
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    // 로그인만 실패했으면 사용자가 /login에서 직접 하면 된다.
  }
}
