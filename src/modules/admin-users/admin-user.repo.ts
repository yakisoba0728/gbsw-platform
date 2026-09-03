import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { lockCredentialAccountForMutation } from "@/core/auth/credential-session-boundary";
import { isUniqueViolation } from "@/core/db/unique-violation";
import { NumberTakenError } from "@/modules/student/student-position";

export { findCurrentYearForUpdate, findCurrentYear } from "@/modules/academic-year/academic-year.repo";

const currentEnrollment = (year: number) => ({
  where: { year },
  take: 1,
  select: {
    id: true,
    grade: true,
    classNo: true,
    number: true,
    status: true,
  },
});

export async function listUsers(year: number) {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      mustChangePassword: true,
      createdAt: true,
      studentProfile: {
        select: { id: true, enrollments: currentEnrollment(year) },
      },
    },
  });
}

export async function findById(userId: string, db: DbClient = prisma) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, deletedAt: true },
  });
}

export async function findDetail(userId: string, year: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      deletedAt: true,
      updatedAt: true,
      mustChangePassword: true,
      createdAt: true,
      studentProfile: {
        select: {
          id: true,
          birthDate: true,
          enrollments: currentEnrollment(year),
        },
      },
      parentLinks: {
        select: {
          student: {
            select: {
              user: { select: { name: true } },
              enrollments: currentEnrollment(year),
            },
          },
        },
      },
    },
  });
}

export async function findRelatedAudit(userId: string, take: number) {
  return prisma.auditLog.findMany({
    where: { OR: [{ actorUserId: userId }, { targetId: userId }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: { actor: { select: { role: true } } },
  });
}

export class EmailTakenError extends Error {}

export { NumberTakenError };

export class UserRevisionConflictError extends Error {}

export type UpdateUserAndEnrollmentInput = {
  expectedUpdatedAt: Date;
  profile: { name: string; email: string; phone: string } | null;
  studentProfile: { studentProfileId: string; birthDate: Date } | null;
  enrollment: {
    studentProfileId: string;
    year: number;
    grade: number;
    classNo: number;
    number: number;
  } | null;
};

async function updateUserAndEnrollmentWithDb(
  db: DbClient,
  userId: string,
  input: UpdateUserAndEnrollmentInput,
): Promise<void> {
  try {
    const { count } = await db.user.updateMany({
      where: { id: userId, updatedAt: input.expectedUpdatedAt },
      data: {
        ...(input.profile ?? {}),
        updatedAt: new Date(),
      },
    });
    if (count === 0) throw new UserRevisionConflictError();
  } catch (error) {
    if (isUniqueViolation(error, "email")) throw new EmailTakenError();
    throw error;
  }

  if (input.studentProfile) {
    await db.studentProfile.update({
      where: { id: input.studentProfile.studentProfileId },
      data: { birthDate: input.studentProfile.birthDate },
    });
  }

  if (input.enrollment) {
    const { studentProfileId, year, grade, classNo, number } = input.enrollment;

    try {
      await db.enrollment.upsert({
        where: { studentProfileId_year: { studentProfileId, year } },
        create: {
          studentProfileId,
          year,
          grade,
          classNo,
          number,
          status: "ENROLLED",
        },
        update: { grade, classNo, number },
      });
    } catch (error) {
      if (isUniqueViolation(error, "number")) throw new NumberTakenError();
      throw error;
    }
  }
}

export async function updateUserAndEnrollment(
  userId: string,
  input: UpdateUserAndEnrollmentInput,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await updateUserAndEnrollmentWithDb(db, userId, input);
    return;
  }

  await withTransaction((tx) => updateUserAndEnrollmentWithDb(tx, userId, input));
}

async function setActiveWithDb(
  db: DbClient,
  userId: string,
  active: boolean,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { status: active ? "ACTIVE" : "INACTIVE" },
  });

  if (!active) {
    await db.session.deleteMany({ where: { userId } });
  }
}

export async function setActive(
  userId: string,
  active: boolean,
  db?: DbClient,
): Promise<void> {
  if (db) {
    await setActiveWithDb(db, userId, active);
    return;
  }

  if (active) {
    await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    return;
  }

  await withTransaction((tx) => setActiveWithDb(tx, userId, active));
}

async function resetCredentialWithDb(
  db: DbClient,
  userId: string,
  passwordHash: string,
): Promise<number> {
  await lockCredentialAccountForMutation(userId, db);

  const { count } = await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: passwordHash },
  });
  if (count === 0) return 0;

  await db.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId } });
  return count;
}

export async function resetCredential(
  userId: string,
  passwordHash: string,
  db?: DbClient,
): Promise<number> {
  if (db) return resetCredentialWithDb(db, userId, passwordHash);

  return withTransaction((tx) => resetCredentialWithDb(tx, userId, passwordHash));
}

// 삭제 표시(deletedAt)를 DB 조건으로도 건다 — 서비스가 이미 막지만, 같은 불변식을
// 두 곳에서 세워 두면 서비스를 거치지 않는 호출이 살아 있는 계정을 지우지 못한다.
async function deletePermanentlyWithDb(
  db: DbClient,
  userId: string,
  confirmName: string,
): Promise<boolean> {
  await db.invite.deleteMany({ where: { usedById: userId } });
  const { count } = await db.user.deleteMany({
    where: { id: userId, name: confirmName, deletedAt: { not: null } },
  });
  return count === 1;
}

export async function deletePermanently(
  userId: string,
  confirmName: string,
  db?: DbClient,
): Promise<boolean> {
  if (db) {
    return deletePermanentlyWithDb(db, userId, confirmName);
  }

  return withTransaction((tx) => deletePermanentlyWithDb(tx, userId, confirmName));
}
