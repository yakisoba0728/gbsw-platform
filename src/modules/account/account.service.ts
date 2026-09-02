import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import type { SessionUser } from "@/core/auth/session";
import { withTransaction } from "@/core/db/client";
import * as repo from "./account.repo";
import type { ChangePasswordInput } from "./account.schema";

export class InvalidCurrentPasswordError extends Error {}

function isInvalidPasswordError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const fields = error as {
    code?: unknown;
    body?: { code?: unknown; message?: unknown };
  };

  return (
    error.message === "INVALID_PASSWORD" ||
    error.message === "Invalid password" ||
    fields.code === "INVALID_PASSWORD" ||
    fields.body?.code === "INVALID_PASSWORD" ||
    fields.body?.message === "Invalid password"
  );
}

/** 별도 권한 액션 없이 세션 사용자의 계정만 변경한다. */
export async function changeOwnPassword(
  actor: SessionUser,
  input: ChangePasswordInput,
  requestHeaders: Headers,
): Promise<void> {
  // 검증 도중 비밀번호가 바뀌면 저장 시 revision 비교로 거부한다.
  const credential = await repo.findOwnCredentialAccountRevision(actor.id);
  if (!credential) throw new Error("CREDENTIAL_ACCOUNT_NOT_FOUND");

  try {
    const result = await auth.api.verifyPassword({
      body: { password: input.currentPassword },
      headers: requestHeaders,
    });
    if (result.status !== true) throw new InvalidCurrentPasswordError();
  } catch (error) {
    if (error instanceof InvalidCurrentPasswordError) throw error;
    if (isInvalidPasswordError(error)) throw new InvalidCurrentPasswordError();
    throw error;
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.session.id || session.user?.id !== actor.id) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const passwordHash = await hashPassword(input.newPassword);

  await withTransaction(async (tx) => {
    await repo.updateOwnPassword({
      userId: actor.id,
      credential,
      currentSessionId: session.session.id,
      passwordHash,
    }, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: "account:change-password",
      targetType: "User",
      targetId: actor.id,
    }, tx);
  });
}
