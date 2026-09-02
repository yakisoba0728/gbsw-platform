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

export type { ParentInviteState };

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "권한이 없습니다.",
  TOO_MANY_ACTIVE_INVITES: `쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다. 하나를 폐기하고 만드세요.`,
  NOT_A_STUDENT: "학생 계정만 만들 수 있습니다.",
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 다시 시도해 주세요.",
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
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
      code: null,
    };
  }

  try {
    const invite = await createParentInvite(actor, parsed.data);
    revalidatePath("/parent-invite");
    return { error: null, code: formatInviteCode(invite.code) };
  } catch (error) {
    const fallback = "코드를 만들지 못했습니다.";
    if (error instanceof InviteError || error instanceof ForbiddenError) {
      return { error: MESSAGES[error.message] ?? fallback, code: null };
    }
    console.error("[invite] 학부모 코드를 만들지 못했습니다.", error);
    return { error: fallback, code: null };
  }
}
