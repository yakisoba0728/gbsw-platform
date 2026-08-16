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

/**
 * 아직 **쓸 수 있는** 학부모 코드 수. MAX_ACTIVE_PARENT_INVITES 한도의 분자다.
 *
 * 판정 규칙은 `lib/invite-code.ts`의 `isInviteUsable`과 같아야 한다 — 거기서는
 * 만료된 코드를 못 쓴다고 보는데 여기서만 안 봤다. 그 결과 학생이 쓸 수 없는
 * 코드 3개가 한도를 계속 차지해 새 코드를 만들지 못하고, 관리자가 손으로 셋을
 * 폐기해야만 풀렸다. `expiresAt`이 null이면 무기한이라 항상 센다.
 *
 * now를 인자로 받는다 — 테스트가 "지금"을 고정할 수 있어야 경계를 검증할 수 있다.
 */
export async function countActiveByStudent(studentId: string, now: Date = new Date()) {
  return prisma.invite.count({
    where: {
      studentId,
      status: "PENDING",
      // isInviteUsable은 expiresAt <= now를 만료로 본다 — 그 여집합이 gt다.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
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
    // 명단에서 빠져 소프트 삭제된 학생은 고를 수 없어야 한다 — 더는 재학생이 아니다.
    where: { user: { deletedAt: null } },
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
