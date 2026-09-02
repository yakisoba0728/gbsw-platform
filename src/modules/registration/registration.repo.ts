import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import { generateStudentCode } from "@/lib/student-code";

export { findCurrentYearForUpdate } from "@/modules/academic-year/academic-year.repo";

export class InviteRaceError extends Error {}

const STUDENT_CODE_RETRIES = 5;

export { NumberTakenError };

export function isStudentCodeCollision(error: unknown): boolean {
  return isUniqueViolation(error, "studentCode");
}

export async function findInviteByCode(code: string, db: DbClient = prisma) {
  return db.invite.findUnique({ where: { code } });
}

export async function emailExists(
  email: string,
  db: DbClient = prisma,
): Promise<boolean> {
  return (await db.user.count({ where: { email } })) > 0;
}

export async function registerFailedAttempt(
  inviteId: string,
  maxAttempts: number,
  db: DbClient = prisma,
): Promise<{ revoked: boolean }> {
  const updated = await db.invite.update({
    where: { id: inviteId },
    data: { failedAttempts: { increment: 1 } },
    select: { failedAttempts: true },
  });

  if (updated.failedAttempts < maxAttempts) return { revoked: false };

  const { count } = await db.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return { revoked: count === 1 };
}

export type RegistrationAccount = {
  userId: string;
  accountId: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
};

async function createUserWithCredential(
  tx: DbClient,
  account: RegistrationAccount,
  role: string,
) {
  await tx.user.create({
    data: {
      id: account.userId,
      name: account.name,
      email: account.email,
      phone: account.phone,
      emailVerified: true,
      role,
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });

  await tx.account.create({
    data: {
      id: account.accountId,
      accountId: account.userId,
      providerId: "credential",
      userId: account.userId,
      password: account.passwordHash,
    },
  });
}

async function consumeInvite(tx: DbClient, inviteId: string, userId: string) {
  const { count } = await tx.invite.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: { status: "USED", usedById: userId },
  });
  if (count !== 1) throw new InviteRaceError("ALREADY_USED");
}

async function completeStudentRegistrationWithDb(
  db: DbClient,
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
): Promise<void> {
  await createUserWithCredential(db, account, "STUDENT");

  const profile = await db.studentProfile.create({
    data: {
      userId: account.userId,
      birthDate: student.birthDate,
      studentCode: generateStudentCode(),
    },
  });

  try {
    await db.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year,
        grade: student.grade,
        classNo: student.classNo,
        number: student.number,
        status: "ENROLLED",
      },
    });
  } catch (error) {
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }

  await consumeInvite(db, inviteId, account.userId);
}

export async function completeStudentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  student: { birthDate: Date; grade: number; classNo: number; number: number },
  year: number,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await completeStudentRegistrationWithDb(db, inviteId, account, student, year);
    return;
  }

  for (let attempt = 1; attempt <= STUDENT_CODE_RETRIES; attempt += 1) {
    try {
      await withTransaction((tx) =>
        completeStudentRegistrationWithDb(tx, inviteId, account, student, year),
      );
      return;
    } catch (error) {
      if (isStudentCodeCollision(error) && attempt < STUDENT_CODE_RETRIES) {
        continue;
      }
      throw error;
    }
  }
}

export async function completeAdminRegistration(
  inviteId: string,
  account: RegistrationAccount,
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    await createUserWithCredential(tx, account, "ADMIN");
    await consumeInvite(tx, inviteId, account.userId);
  };

  if (db) {
    await run(db);
    return;
  }

  await withTransaction(run);
}

export async function completeParentRegistration(
  inviteId: string,
  account: RegistrationAccount,
  studentId: string,
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    await createUserWithCredential(tx, account, "PARENT");
    await tx.parentStudent.create({
      data: { parentUserId: account.userId, studentId },
    });
    await consumeInvite(tx, inviteId, account.userId);
  };

  if (db) {
    await run(db);
    return;
  }

  await withTransaction(run);
}
