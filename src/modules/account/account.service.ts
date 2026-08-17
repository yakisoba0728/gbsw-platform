import { recordAudit } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import type { SessionUser } from "@/core/auth/session";
import * as repo from "./account.repo";
import type { ChangePasswordInput } from "./account.schema";

/**
 * 본인 비밀번호 변경. 별도 권한 액션이 없다 — 대상이 항상 세션에서 정해져
 * 남의 계정을 건드릴 경로가 없다.
 */
export async function changeOwnPassword(
  actor: SessionUser,
  input: ChangePasswordInput,
  requestHeaders: Headers,
): Promise<void> {
  // 현재 비밀번호 검증과 해싱은 Better Auth에 맡긴다.
  await auth.api.changePassword({
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      // 비밀번호가 바뀌면 다른 기기의 세션은 끊는다.
      revokeOtherSessions: true,
    },
    headers: requestHeaders,
  });

  await repo.clearMustChangePassword(actor.id);

  await recordAudit({
    actorUserId: actor.id,
    action: "account:change-password",
    targetType: "User",
    targetId: actor.id,
  });
}
