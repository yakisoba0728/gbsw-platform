import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { lockCredentialAccountForMutation } from "@/core/auth/credential-session-boundary";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export type CredentialAccountRevision = {
  id: string;
  updatedAt: Date;
};

export type UpdateOwnPasswordInput = {
  userId: string;
  credential: CredentialAccountRevision;
  currentSessionId: string;
  passwordHash: string;
};

type AccountReader = Pick<DbClient, "account">;

export async function findOwnCredentialAccountRevision(
  userId: string,
  db: AccountReader = prisma,
): Promise<CredentialAccountRevision | null> {
  return db.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true, updatedAt: true },
  });
}

async function updateOwnPasswordWithDb(
  db: DbClient,
  input: UpdateOwnPasswordInput,
): Promise<void> {
  await lockCredentialAccountForMutation(input.userId, db);

  const credentialUpdate = await db.account.updateMany({
    where: {
      id: input.credential.id,
      userId: input.userId,
      providerId: "credential",
      updatedAt: input.credential.updatedAt,
    },
    data: { password: input.passwordHash },
  });

  if (credentialUpdate.count === 0) throw new Error("CREDENTIAL_ACCOUNT_STALE");

  await db.user.update({
    where: { id: input.userId },
    data: { mustChangePassword: false },
  });

  const currentSessionDelete = await db.session.deleteMany({
    where: { id: input.currentSessionId, userId: input.userId },
  });

  if (currentSessionDelete.count !== 1) throw new Error("SESSION_STALE");

  await db.session.deleteMany({
    where: { userId: input.userId, id: { not: input.currentSessionId } },
  });
}

export async function updateOwnPassword(
  input: UpdateOwnPasswordInput,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await updateOwnPasswordWithDb(db, input);
    return;
  }

  await withTransaction((tx) => updateOwnPasswordWithDb(tx, input));
}
