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
  requireVerified,
  VerificationError,
} from "@/modules/verification/verification.service";

// ── 최초 교사 부트스트랩 ─────────────────────────────────────

export type BootstrapState = {
  error: string | null;
  /**
   * 방금 제출한 이름·이메일·전화. 액션이 오류를 return하면 React 19가 폼을 통째로
   * reset()하므로, 비제어 칸은 이 값을 defaultValue로 다시 심어야 살아남는다.
   * 비밀번호는 담지 않는다 — 지워지는 편이 안전하다.
   */
  values: { name: string; email: string; phone: string };
};

export async function createInitialAdminAction(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  const token = String(formData.get("token") ?? "");

  // 검증보다 먼저 뽑아 둔다 — 어느 실패 경로로 빠지든 화면이 되살릴 값은 같다.
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };

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
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      values,
    };
  }

  try {
    await createInitialAdmin(token, parsed.data);
  } catch {
    // 토큰 불일치인지 이미 설정됐는지 구분해 알리지 않는다.
    return { error: "교사 계정을 만들 수 없습니다.", values };
  }

  await signInSilently(parsed.data.email, parsed.data.password);
  redirect("/");
}

// ── 초대코드 가입 ─────────────────────────────────────────────

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
  const values = { code: String(formData.get("code") ?? "") };
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
  /**
   * 방금 제출한 이름·생년월일. 액션이 오류를 return하면 React 19가 폼을 통째로
   * reset()하므로, 비제어 칸은 이 값을 defaultValue로 다시 심어야 살아남는다.
   * 비밀번호는 담지 않는다 — 지워지는 편이 안전하다.
   */
  values: { name: string; birthDate: string };
};

export async function completeRegistrationAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // 검증보다 먼저 뽑아 둔다 — 어느 실패 경로로 빠지든 화면이 되살릴 값은 같다.
  const values = {
    name: String(formData.get("name") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
  };

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
    return {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      values,
    };
  }

  try {
    await completeRegistration(parsed.data);
  } catch (error) {
    // 우리가 문구를 정제해 둔 오류만 그대로 보여준다. 그 밖(Prisma 원문 등)은 덮는다.
    if (error instanceof RegistrationError || error instanceof VerificationError) {
      return { error: error.message, values };
    }
    // 덮은 오류는 서버 콘솔에 남긴다 — 여기서 안 남기면 원인이 어디에도 없다.
    console.error("[registration] 가입하지 못했습니다.", error);
    return { error: "가입하지 못했습니다.", values };
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
  /** 임시 우회 기간에는 요청 즉시 확인 처리된다. */
  verified?: boolean;
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
    const { verified } = await requestVerification(
      parsedCode.data,
      parsed.data.channel,
      parsed.data.target,
    );
    return { ok: true, error: null, verified };
  } catch (error) {
    // 서비스가 정제한 문구만 내보낸다. 그 밖의 오류는 원문을 감춘다.
    if (error instanceof VerificationError || error instanceof RegistrationError) {
      return { ok: false, error: error.message };
    }
    // 감춘 오류는 서버 콘솔에 남긴다. 대상·코드는 적지 않는다 — 오류 객체만 넘긴다.
    console.error("[verification] 인증번호를 보내지 못했습니다.", error);
    return { ok: false, error: "인증번호를 보내지 못했습니다." };
  }
}

export async function confirmVerificationAction(
  channel: string,
  target: string,
  code: string,
): Promise<VerifyResult> {
  if (code === "") {
    const parsed = requestCodeSchema.safeParse({ channel, target });
    if (!parsed.success) {
      return { ok: false, error: "형식을 확인해 주세요." };
    }

    try {
      await requireVerified(parsed.data.channel, parsed.data.target);
      return { ok: true, error: null, verified: true };
    } catch (error) {
      if (error instanceof VerificationError) {
        return { ok: false, error: error.message };
      }
      console.error("[verification] 인증 상태를 확인하지 못했습니다.", error);
      return { ok: false, error: "인증하지 못했습니다." };
    }
  }

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
    if (error instanceof VerificationError) {
      return { ok: false, error: error.message };
    }
    console.error("[verification] 인증하지 못했습니다.", error);
    return { ok: false, error: "인증하지 못했습니다." };
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
