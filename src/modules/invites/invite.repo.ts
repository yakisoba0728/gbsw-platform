import { prisma, type DbClient } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";

export type InsertInviteInput = {
  code: string;
  role: string;
  metadata: Prisma.InputJsonObject;
  studentId?: string;
  expiresAt: Date | null;
  createdById: string;
  createdByName: string;
};

export async function insertInvite(
  input: InsertInviteInput,
  db: DbClient = prisma,
) {
  return db.invite.create({
    data: {
      code: input.code,
      role: input.role,
      metadata: input.metadata,
      studentId: input.studentId ?? null,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
      createdByName: input.createdByName,
    },
  });
}

export async function findById(id: string) {
  return prisma.invite.findUnique({ where: { id } });
}

export async function listAll(year: number) {
  return prisma.invite.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      usedBy: { select: { name: true, email: true } },
      student: {
        select: {
          user: { select: { name: true } },
          enrollments: {
            where: { year },
            take: 1,
            select: {
              grade: true,
              classNo: true,
              number: true,
            },
          },
        },
      },
    },
  });
}

export async function listByStudent(studentId: string) {
  return prisma.invite.findMany({
    where: { studentId, role: "PARENT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function countActiveByStudent(
  studentId: string,
  now: Date = new Date(),
  db: DbClient = prisma,
) {
  return db.invite.count({
    where: {
      studentId,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function lockStudentForParentInvite(
  studentId: string,
  db: DbClient,
): Promise<boolean> {
  // 계정 수정·삭제와 같은 User → StudentProfile 순서로 잠근다.
  const users = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id"
    FROM "user" AS u
    WHERE u."id" = (
      SELECT sp."userId" FROM "StudentProfile" AS sp WHERE sp."id" = ${studentId}
    )
    FOR UPDATE
  `;
  const user = users[0];
  if (!user) return false;

  const profiles = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentProfile"
    WHERE "id" = ${studentId} AND "userId" = ${user.id}
    FOR UPDATE
  `;
  return profiles.length === 1;
}

export async function revokePending(
  id: string,
  db: DbClient = prisma,
): Promise<number> {
  const { count } = await db.invite.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return count;
}

export type RevokedInviteInfo = { id: string; role: string; status: string };

/** 명단 반영에서 빠진 계정·학생에 묶인 대기 코드를 찾아 폐기한다. */
export async function revokePendingByTargets(
  targets: { usedByIds: string[]; studentIds: string[] },
  db: DbClient = prisma,
): Promise<RevokedInviteInfo[]> {
  const { usedByIds, studentIds } = targets;
  if (usedByIds.length === 0 && studentIds.length === 0) return [];

  const revoked = await db.invite.findMany({
    where: {
      status: "PENDING",
      OR: [
        ...(usedByIds.length > 0 ? [{ usedById: { in: usedByIds } }] : []),
        ...(studentIds.length > 0 ? [{ studentId: { in: studentIds } }] : []),
      ],
    },
    select: { id: true, role: true, status: true },
  });

  if (revoked.length > 0) {
    await db.invite.updateMany({
      where: { id: { in: revoked.map((invite) => invite.id) }, status: "PENDING" },
      data: { status: "REVOKED" },
    });
  }
  return revoked;
}

export async function getStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findUnique({ where: { userId } });
}

export async function codeExists(code: string): Promise<boolean> {
  return (await prisma.invite.count({ where: { code } })) > 0;
}

export async function findStudentById(studentId: string) {
  return prisma.studentProfile.findUnique({ where: { id: studentId } });
}

export async function listStudents(year: number) {
  const students = await prisma.studentProfile.findMany({
    where: { user: { deletedAt: null } },
    select: {
      id: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
        },
      },
    },
  });

  return students.sort((a, b) => {
    const x = a.enrollments[0];
    const y = b.enrollments[0];
    return (
      (x?.grade ?? 99) - (y?.grade ?? 99) ||
      (x?.classNo ?? 99) - (y?.classNo ?? 99) ||
      (x?.number ?? 99) - (y?.number ?? 99)
    );
  });
}
