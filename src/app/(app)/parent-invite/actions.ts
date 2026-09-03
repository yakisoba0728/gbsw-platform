"use server";

import { revalidatePath } from "next/cache";
import { defineFormAction } from "@/lib/action";
import { formatInviteCode } from "@/modules/invites/invite-code";
import { createParentInviteSchema } from "@/modules/invites/invite.schema";
import {
  createParentInvite,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
} from "@/modules/invites/invite.service";
import type { ParentInviteState } from "./action-state";

export type { ParentInviteState };

const MESSAGES: Record<string, string> & { FORBIDDEN: string } = {
  FORBIDDEN: "권한이 없습니다.",
  TOO_MANY_ACTIVE_INVITES: `쓰지 않은 코드가 ${MAX_ACTIVE_PARENT_INVITES}개 있습니다. 하나를 폐기하고 만드세요.`,
  NOT_A_STUDENT: "학생 계정만 만들 수 있습니다.",
  CODE_GENERATION_FAILED: "코드를 만들지 못했습니다. 다시 시도해 주세요.",
};

export const createParentInviteAction = defineFormAction<ParentInviteState>()({
  schema: createParentInviteSchema,
  input: (formData) => ({
    name: formData.get("name"),
  }),
  failState: (error) => ({ error, code: null }),
  run: async (actor, data) => {
    const invite = await createParentInvite(actor, data);
    revalidatePath("/parent-invite");
    return { error: null, code: formatInviteCode(invite.code) };
  },
  errorClass: InviteError,
  messages: MESSAGES,
  logPrefix: "[invite]",
  invalidInputMessage: "입력을 확인해 주세요.",
  failureMessage: "코드를 만들지 못했습니다.",
});
