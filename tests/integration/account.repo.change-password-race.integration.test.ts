import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { assertCredentialSignInSessionStillCurrent } from "@/core/auth/credential-session-boundary";
import {
  findOwnCredentialAccountRevision,
  updateOwnPassword,
} from "@/modules/account/account.repo";

const createdUserIds: string[] = [];

async function createPasswordFixture(label: string) {
  const userId = randomUUID();
  const accountId = randomUUID();
  const currentSessionId = randomUUID();
  const otherSessionId = randomUUID();

  createdUserIds.push(userId);

  await prisma.user.create({
    data: {
      id: userId,
      name: `계정 변경 ${label}`,
      email: `itest-account-${label}-${userId}@example.invalid`,
      phone: "010-0000-3100",
      role: "STUDENT",
      status: "ACTIVE",
      mustChangePassword: true,
    },
  });

  await prisma.account.create({
    data: {
      id: accountId,
      accountId: userId,
      providerId: "credential",
      password: "old-hash",
      userId,
    },
  });

  await prisma.session.createMany({
    data: [
      {
        id: currentSessionId,
        token: `itest-account-current-${currentSessionId}`,
        userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      {
        id: otherSessionId,
        token: `itest-account-other-${otherSessionId}`,
        userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    ],
  });

  const credential = await findOwnCredentialAccountRevision(userId);
  if (!credential) throw new Error("fixture credential was not created");

  return { userId, accountId, currentSessionId, credential };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
});

describe("updateOwnPassword() — stale credential/session races", () => {
  it("commits the password change, mustChangePassword clear, and all session revokes together", async () => {
    const fixture = await createPasswordFixture("happy");

    await updateOwnPassword({
      userId: fixture.userId,
      credential: fixture.credential,
      currentSessionId: fixture.currentSessionId,
      passwordHash: "new-hash",
    });

    const [account, user, sessions] = await Promise.all([
      prisma.account.findUnique({ where: { id: fixture.accountId } }),
      prisma.user.findUnique({ where: { id: fixture.userId } }),
      prisma.session.count({ where: { userId: fixture.userId } }),
    ]);

    expect(account?.password).toBe("new-hash");
    expect(user?.mustChangePassword).toBe(false);
    expect(sessions).toBe(0);
  });

  it("does not overwrite an intervening password reset with a stale credential revision", async () => {
    const fixture = await createPasswordFixture("credential-stale");
    const resetUpdatedAt = new Date(fixture.credential.updatedAt.getTime() + 1_000);

    await prisma.account.update({
      where: { id: fixture.accountId },
      data: { password: "reset-hash", updatedAt: resetUpdatedAt },
    });

    await expect(
      updateOwnPassword({
        userId: fixture.userId,
        credential: fixture.credential,
        currentSessionId: fixture.currentSessionId,
        passwordHash: "new-hash",
      }),
    ).rejects.toThrow("CREDENTIAL_ACCOUNT_STALE");

    const [account, user, sessions] = await Promise.all([
      prisma.account.findUnique({ where: { id: fixture.accountId } }),
      prisma.user.findUnique({ where: { id: fixture.userId } }),
      prisma.session.count({ where: { userId: fixture.userId } }),
    ]);

    expect(account?.password).toBe("reset-hash");
    expect(user?.mustChangePassword).toBe(true);
    expect(sessions).toBe(2);
  });

  it("rolls back password and mustChangePassword writes when the captured current session is gone", async () => {
    const fixture = await createPasswordFixture("session-stale");

    await prisma.session.deleteMany({
      where: { id: fixture.currentSessionId, userId: fixture.userId },
    });

    await expect(
      updateOwnPassword({
        userId: fixture.userId,
        credential: fixture.credential,
        currentSessionId: fixture.currentSessionId,
        passwordHash: "new-hash",
      }),
    ).rejects.toThrow("SESSION_STALE");

    const [account, user, sessions] = await Promise.all([
      prisma.account.findUnique({ where: { id: fixture.accountId } }),
      prisma.user.findUnique({ where: { id: fixture.userId } }),
      prisma.session.count({ where: { userId: fixture.userId } }),
    ]);

    expect(account?.password).toBe("old-hash");
    expect(user?.mustChangePassword).toBe(true);
    expect(sessions).toBe(1);
  });

  it("deletes a late old-password sign-in session inserted after the password-change session sweep", async () => {
    const fixture = await createPasswordFixture("signin-stale-after-change");
    const signInSessionId = randomUUID();
    const signInPassword = "old-password-before-change";
    const oldHash = await hashPassword(signInPassword);
    const newHash = await hashPassword("new-password-after-change");
    const mutationDeletedSessions = deferred();
    const releaseMutation = deferred();

    await prisma.account.update({
      where: { id: fixture.accountId },
      data: { password: oldHash },
    });

    const mutation = prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: fixture.accountId },
        data: { password: newHash },
      });
      await tx.session.deleteMany({ where: { userId: fixture.userId } });
      mutationDeletedSessions.resolve();
      await releaseMutation.promise;
    }, { timeout: 10_000 });

    await mutationDeletedSessions.promise;

    await prisma.session.create({
      data: {
        id: signInSessionId,
        token: `itest-account-race-${signInSessionId}`,
        userId: fixture.userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    const hook = assertCredentialSignInSessionStillCurrent(
      { id: signInSessionId, userId: fixture.userId },
      {
        path: "/sign-in/email",
        body: {
          email: `itest-account-signin-stale-after-change-${fixture.userId}@example.invalid`,
          password: signInPassword,
        },
      },
    );

    releaseMutation.resolve();
    await expect(mutation).resolves.toBeUndefined();
    await expect(hook).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });

    await expect(
      prisma.session.findUnique({ where: { id: signInSessionId } }),
    ).resolves.toBeNull();
  });

  it("lets an old-password sign-in finish first, then password change revokes that newly inserted session", async () => {
    const fixture = await createPasswordFixture("change-revokes-fresh-signin");
    const signInSessionId = randomUUID();
    const signInPassword = "old-password-before-change";
    const oldHash = await hashPassword(signInPassword);

    await prisma.account.update({
      where: { id: fixture.accountId },
      data: { password: oldHash },
    });
    await prisma.session.create({
      data: {
        id: signInSessionId,
        token: `itest-account-fresh-${signInSessionId}`,
        userId: fixture.userId,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    });

    await assertCredentialSignInSessionStillCurrent(
      { id: signInSessionId, userId: fixture.userId },
      {
        path: "/sign-in/email",
        body: {
          email: `itest-account-change-revokes-fresh-signin-${fixture.userId}@example.invalid`,
          password: signInPassword,
        },
      },
    );

    const credential = await findOwnCredentialAccountRevision(fixture.userId);
    if (!credential) throw new Error("credential disappeared");

    await updateOwnPassword({
      userId: fixture.userId,
      credential,
      currentSessionId: fixture.currentSessionId,
      passwordHash: await hashPassword("new-password-after-change"),
    });

    await expect(
      prisma.session.findUnique({ where: { id: signInSessionId } }),
    ).resolves.toBeNull();
  });
});
