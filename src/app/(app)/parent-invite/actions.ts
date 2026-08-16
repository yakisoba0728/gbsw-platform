"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { formatInviteCode } from "@/lib/invite-code";
import { createParentInviteSchema } from "@/modules/invites/invite.schema";
import {
  createParentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
} from "@/modules/invites/invite.service";
import type { ParentInviteState } from "./action-state";

/*
 * 상태 타입은 action-state.ts에 있다 (다른 모듈과 같은 관례).
 * 여기서 타입만 다시 내보내 기존 import 경로(`from "./actions"`)를 깨지 않는다 —
 * 타입 export는 컴파일 뒤 사라지므로 "use server"의 "async 함수만 export" 제약에
 * 걸리지 않는다. 화면은 앞으로 ./action-state에서 직접 가져가면 된다.
 */
export type { ParentInviteState };

/**
 * 서비스가 던지는 오류 코드 → 화면 문구.
 *
 * 학생 본인 화면이라 문구가 관리자 발급 화면(admin/invites)과 다르다 —
 * 같은 코드라도 "이 학생에게"가 아니라 "내 코드가"로 읽혀야 한다.
 * `FORBIDDEN`을 사전에 두는 이유는 admin/invites/actions.ts와 같다.
 */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "이 작업을 할 권한이 없습니다.",
  TOO_MANY_ACTIVE_INVITES: `사용하지 않은 코드가 이미 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다. 기존 코드를 쓰거나 폐기한 뒤 다시 시도해 주세요.`,
  NOT_A_STUDENT: "학생 계정만 만들 수 있습니다.",
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export async function createParentInviteAction(
  _prev: ParentInviteState,
  formData: FormData,
): Promise<ParentInviteState> {
  const actor = await requireAuth();

  const parsed = createParentInviteSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      code: null,
    };
  }

  try {
    // studentId는 넘기지 않는다 — 서비스가 세션에서 본인 학생 프로필을 찾는다.
    const invite = await createParentInvite(actor, parsed.data);
    revalidatePath("/parent-invite");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    const fallback = "코드를 만들지 못했습니다.";
    if (error instanceof InviteError || error instanceof ForbiddenError) {
      return { error: MESSAGES[error.message] ?? fallback, code: null };
    }
    return { error: fallback, code: null };
  }
}
