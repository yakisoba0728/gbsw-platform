import { prisma } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export type InsertInviteInput = {
  code: string;
  role: string;
  metadata: Prisma.InputJsonObject;
  studentId?: string;
  expiresAt: Date | null;
  createdById: string;
};

export async function insertInvite(input: InsertInviteInput) {
  return prisma.invite.create({
    data: {
      code: input.code,
      role: input.role,
      metadata: input.metadata,
      studentId: input.studentId ?? null,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
    },
  });
}

export async function findById(id: string) {
  return prisma.invite.findUnique({ where: { id } });
}

export async function listAll(year: number) {
  return prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      usedBy: { select: { name: true, email: true } },
      student: {
        select: {
          user: { select: { name: true } },
          enrollments: {
            where: { year },
            take: 1,
            select: {
              number: true,
              schoolClass: { select: { grade: true, classNo: true } },
            },
          },
        },
      },
    },
  });
}

export async function listByStudent(studentId: string) {
  return prisma.invite.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

export async function countActiveByStudent(studentId: string) {
  return prisma.invite.count({
    where: { studentId, status: "PENDING" },
  });
}

/** PENDING인 것만 폐기한다. 이미 쓰였거나 폐기된 코드는 건드리지 않는다. */
export async function revokePending(id: string): Promise<number> {
  const { count } = await prisma.invite.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return count;
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

/** 학부모 코드 발급 시 고를 학생 목록. 학년·반·번호 순. */
export async function listStudents(year: number) {
  const students = await prisma.studentProfile.findMany({
    select: {
      id: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });

  // 학년→반→번호 순. 관계 배열은 Prisma orderBy로 정렬할 수 없어 여기서 맞춘다.
  return students.sort((a, b) => {
    const x = a.enrollments[0];
    const y = b.enrollments[0];
    return (
      (x?.schoolClass?.grade ?? 99) - (y?.schoolClass?.grade ?? 99) ||
      (x?.schoolClass?.classNo ?? 99) - (y?.schoolClass?.classNo ?? 99) ||
      (x?.number ?? 99) - (y?.number ?? 99)
    );
  });
}
