import { prisma } from "@/core/db/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function listUsers() {
  return prisma.user.findMany({
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
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });
}

export async function findById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
}

/** 상세 화면이 쓰는 전체 정보. */
export async function findDetail(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
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
        select: {
          id: true,
          birthDate: true,
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
      parentLinks: {
        select: {
          student: {
            select: {
              user: { select: { name: true } },
              number: true,
              schoolClass: { select: { grade: true, classNo: true } },
            },
          },
        },
      },
    },
  });
}

/** 이 사용자가 남겼거나 이 사용자를 대상으로 한 기록. */
export async function findRelatedAudit(userId: string, take: number) {
  return prisma.auditLog.findMany({
    where: { OR: [{ actorUserId: userId }, { targetId: userId }] },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true } } },
  });
}

export async function updateProfile(
  userId: string,
  data: { name: string; phone: string | null },
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data });
}

/**
 * 학생 소속 수정. 학급이 없으면 만든다 — 가입 때와 같은 방식이다.
 * (registration.repo의 upsert 패턴과 동일)
 */
export async function updateStudentProfile(
  studentProfileId: string,
  data: { birthDate: Date; grade: number; classNo: number; number: number },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const schoolClass = await tx.schoolClass.upsert({
      where: { grade_classNo: { grade: data.grade, classNo: data.classNo } },
      create: { grade: data.grade, classNo: data.classNo },
      update: {},
    });

    await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: {
        birthDate: data.birthDate,
        number: data.number,
        classId: schoolClass.id,
      },
    });
  });
}

export async function setStatus(userId: string, status: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { status } });
}

export async function setMustChangePassword(
  userId: string,
  value: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: value },
  });
}

/** credential 계정의 비밀번호를 갈아끼운다. */
export async function replaceCredentialPassword(
  userId: string,
  passwordHash: string,
): Promise<number> {
  const { count } = await prisma.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: passwordHash },
  });
  return count;
}

/** 로그인 상태를 끊는다. 비활성화·비밀번호 초기화 시 함께 호출한다. */
export async function deleteSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
