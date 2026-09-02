import { prisma, type DbClient, withTransaction } from "@/core/db/client";

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

type CreateAdminUserInput = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

async function createAdminUserWithDb(
  db: DbClient,
  input: CreateAdminUserInput,
): Promise<void> {
  await db.user.create({
    data: {
      id: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      emailVerified: true,
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });

  await db.account.create({
    data: {
      id: input.accountId,
      accountId: input.userId,
      providerId: "credential",
      userId: input.userId,
      password: input.passwordHash,
    },
  });
}

export async function createAdminUser(
  input: CreateAdminUserInput,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await createAdminUserWithDb(db, input);
    return;
  }

  await withTransaction((tx) => createAdminUserWithDb(tx, input));
}
