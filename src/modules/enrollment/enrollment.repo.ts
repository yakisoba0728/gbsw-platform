import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

export { findCurrentYear, findCurrentYearForUpdate } from "@/modules/academic-year/academic-year.repo";

export { NumberTakenError };

export async function listByYear(year: number, db: DbClient = prisma) {
  const profiles = await db.studentProfile.findMany({
    where: { user: { role: "STUDENT", deletedAt: null } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true, email: true, status: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          updatedAt: true,
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });

  return profiles.map((p) => {
    const e = p.enrollments[0];
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      birthDate: p.birthDate,
      accountActive: p.user.status === "ACTIVE",
      enrollmentUpdatedAt: e?.updatedAt ?? null,
      grade: e?.grade ?? null,
      classNo: e?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
    };
  });
}

export async function findStudentDetail(
  studentProfileId: string,
  year: number,
  db: DbClient = prisma,
) {
  const profile = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      id: true,
      studentCode: true,
      birthDate: true,
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });
  if (!profile) return null;

  const enrollment = profile.enrollments[0];
  return {
    studentProfileId: profile.id,
    userId: profile.user.id,
    studentCode: profile.studentCode,
    name: profile.user.name,
    email: profile.user.email,
    role: profile.user.role,
    birthDate: profile.birthDate,
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
    status: enrollment?.status ?? null,
    removed: enrollment?.status !== "ENROLLED",
  };
}

export type PlannedEnrollment = Omit<EnrollmentChange, "expectedUpdatedAt"> & {
  userId: string;
  accountActive: boolean;
  statusChanged: boolean;
};

export async function applyAll(
  year: number,
  items: PlannedEnrollment[],
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    for (const item of items) {
      await tx.enrollment.upsert({
        where: {
          studentProfileId_year: {
            studentProfileId: item.studentProfileId,
            year,
          },
        },
        create: {
          studentProfileId: item.studentProfileId,
          year,
          grade: item.grade,
          classNo: item.classNo,
          number: item.number,
          status: item.status,
        },
        update: {
          grade: item.grade,
          classNo: item.classNo,
          number: item.number,
          status: item.status,
        },
      });

      if (item.statusChanged) {
        await tx.user.update({
          where: { id: item.userId },
          data: { status: item.accountActive ? "ACTIVE" : "INACTIVE" },
        });

        if (!item.accountActive) {
          await tx.session.deleteMany({ where: { userId: item.userId } });
        }
      } else {
        await tx.user.update({
          where: { id: item.userId },
          data: { updatedAt: new Date() },
        });
      }
    }
  };

  try {
    if (db) {
      await run(db);
      return;
    }

    await withTransaction(
      run,
      { timeout: 30_000, maxWait: 5_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
