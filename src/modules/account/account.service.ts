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

/**
 * 본인 비밀번호 변경. 별도 권한 액션이 없다 — 대상이 항상 세션에서 정해져
 * 남의 계정을 건드릴 경로가 없다.
 */
export async function changeOwnPassword(
  actor: SessionUser,
  input: ChangePasswordInput,
  requestHeaders: Headers,
): Promise<void> {
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

  // Better Auth가 로그인 때 쓰는 것과 같은 해시 함수. 트랜잭션 밖에서 끝낸다.
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
