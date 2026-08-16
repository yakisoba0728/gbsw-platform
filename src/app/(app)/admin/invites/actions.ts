"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { formatInviteCode } from "@/lib/invite-code";
import {
  createAdminInviteSchema,
  createParentInviteForSchema,
  createStudentInviteSchema,
} from "@/modules/invites/invite.schema";
import {
  createAdminInvite,
  createParentInviteFor,
  createStudentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} from "@/modules/invites/invite.service";
import type { InviteFormState, RevokeState } from "./action-state";

/*
 * 상태 타입은 action-state.ts에 있다 (다른 5개 모듈과 같은 관례).
 * 여기서 타입만 다시 내보내 기존 import 경로(`from "./actions"`)를 깨지 않는다 —
 * 타입 export는 컴파일 뒤 사라지므로 "use server"의 "async 함수만 export" 제약에
 * 걸리지 않는다. 화면은 앞으로 ./action-state에서 직접 가져가면 된다.
 */
export type { InviteFormState, RevokeState };

/**
 * 서비스가 던지는 오류 코드 → 화면 문구.
 *
 * `FORBIDDEN`(ForbiddenError)을 사전에 넣는 것이 핵심이다. 예전엔 폐기 액션의
 * catch-all이 권한 거부를 "이미 사용되었거나 폐기된 코드입니다"로 덮었고,
 * 발급 액션은 권한 거부와 CODE_GENERATION_FAILED를 같은 문구로 덮었다 —
 * 감사로그에는 authz:denied가 정확히 남는데 화면이 다른 원인을 가리켰다.
 * core/authz/errors.ts가 "권한 침해 시도와 일시적 장애가 똑같이 보였다"고
 * 지적한 그 문제다.
 */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  // 유일한 코드를 5회 안에 못 뽑았다 — 일시적 장애이므로 다시 시도하면 풀린다.
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  TOO_MANY_ACTIVE_INVITES: `이 학생에게 아직 쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다.`,
  STUDENT_NOT_FOUND: "해당 학생을 찾을 수 없습니다.",
  NOT_FOUND: "코드를 찾을 수 없습니다.",
  NOT_PENDING: "이미 사용되었거나 폐기된 코드입니다.",
};

/**
 * 코드로 가를 수 있는 오류는 사전에서, 나머지(DB 장애 등)는 액션별 폴백으로.
 * 폴백은 액션마다 다르다 — "무엇을 못 했는지"는 사전이 알 수 없다.
 */
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof InviteError || error instanceof ForbiddenError) {
    return MESSAGES[error.message] ?? fallback;
  }
  return fallback;
}

function optionalDays(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  return Number(raw);
}

export async function createStudentInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const parsed = createStudentInviteSchema.safeParse({
    name: formData.get("name"),
    birthDate: formData.get("birthDate"),
    grade: Number(formData.get("grade")),
    classNo: Number(formData.get("classNo")),
    number: Number(formData.get("number")),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createStudentInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return { error: messageFor(error, "코드를 발급하지 못했습니다."), code: null };
  }
}

export async function createAdminInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const parsed = createAdminInviteSchema.safeParse({
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createAdminInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return { error: messageFor(error, "코드를 발급하지 못했습니다."), code: null };
  }
}

export async function createParentInviteForAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const actor = await requireAuth();

  const parsed = createParentInviteForSchema.safeParse({
    studentId: formData.get("studentId"),
    name: formData.get("name"),
    expiresInDays: optionalDays(formData.get("expiresInDays")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createParentInviteFor(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    return { error: messageFor(error, "코드를 발급하지 못했습니다."), code: null };
  }
}

export async function revokeInviteAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const actor = await requireAuth();
  const inviteId = String(formData.get("inviteId") ?? "");

  try {
    await revokeInvite(actor, inviteId);
    // 이 액션은 관리자 목록과 학생의 학부모 코드 목록 양쪽에서 쓰인다.
    revalidatePath("/admin/invites");
    revalidatePath("/parent-invite");
    return { error: null };
  } catch (error) {
    return { error: messageFor(error, "폐기하지 못했습니다.") };
  }
}
