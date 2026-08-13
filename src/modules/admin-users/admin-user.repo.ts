import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 현재 학년도 소속만 한 줄 붙인다. 화면은 늘 "지금 몇 반인지"를 묻는다. */
const currentEnrollment = (year: number) => ({
  where: { year },
  take: 1,
  select: {
    id: true,
    number: true,
    status: true,
    schoolClass: { select: { grade: true, classNo: true } },
  },
});

export async function listUsers(year: number) {
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
        select: { id: true, enrollments: currentEnrollment(year) },
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

/** 이 사용자가 남겼거나 이 사용자를 대상으로 한 기록. */
export async function findRelatedAudit(userId: string, take: number) {
  return prisma.auditLog.findMany({
    where: { OR: [{ actorUserId: userId }, { targetId: userId }] },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true } } },
  });
}

/** 이메일이 이미 다른 계정에 쓰이고 있을 때. (registration.repo의 InviteRaceError와 같은 방식) */
export class EmailTakenError extends Error {}

export async function updateProfile(
  userId: string,
  data: { name: string; email: string; phone: string },
): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (error) {
    // 미리 조회해서 검사하면 그 사이에 끼어드는 요청을 막지 못한다.
    // 유일 제약이 진짜 방어선이므로 위반을 잡아서 옮긴다.
    if (isUniqueViolation(error, "email")) throw new EmailTakenError();
    throw error;
  }
}

/** 이 반·번호가 이미 다른 학생에게 배정돼 있을 때. (Enrollment_classId_number_key) */
export class NumberTakenError extends Error {}

/**
 * 학생 소속 수정. 학급이 없으면 만든다 — 가입 때와 같은 방식이다.
 * (registration.repo의 upsert 패턴과 동일)
 *
 * 생년월일은 신원이라 StudentProfile에 남아 있고, 반·번호만 Enrollment로 간다.
 */
export async function updateEnrollment(
  studentProfileId: string,
  year: number,
  data: { birthDate: Date; grade: number; classNo: number; number: number },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: { birthDate: data.birthDate },
    });

    const schoolClass = await tx.schoolClass.upsert({
      where: {
        year_grade_classNo: { year, grade: data.grade, classNo: data.classNo },
      },
      create: { year, grade: data.grade, classNo: data.classNo },
      update: {},
    });

    try {
      await tx.enrollment.upsert({
        where: { studentProfileId_year: { studentProfileId, year } },
        create: {
          studentProfileId,
          year,
          classId: schoolClass.id,
          number: data.number,
          status: "ENROLLED",
        },
        update: { classId: schoolClass.id, number: data.number },
      });
    } catch (error) {
      // updateProfile과 같은 이유 — 미리 조회해 봐야 그 사이에 끼어드는 요청을 못 막는다.
      if (isUniqueViolation(error, "number")) throw new NumberTakenError();
      throw error;
    }
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
