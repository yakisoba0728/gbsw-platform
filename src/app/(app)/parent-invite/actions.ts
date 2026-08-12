"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { formatInviteCode } from "@/lib/invite-code";
import { createParentInviteSchema } from "@/modules/invites/invite.schema";
import {
  createParentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
} from "@/modules/invites/invite.service";

export type ParentInviteState = { error: string | null; code: string | null };

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
    if (error instanceof InviteError) {
      if (error.message === "TOO_MANY_ACTIVE_INVITES") {
        return {
          error: `사용하지 않은 코드가 이미 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다. 기존 코드를 쓰거나 폐기한 뒤 다시 시도하세요.`,
          code: null,
        };
      }
      if (error.message === "NOT_A_STUDENT") {
        return { error: "학생 계정만 만들 수 있습니다.", code: null };
      }
    }
    return { error: "코드를 만들지 못했습니다.", code: null };
  }
}
