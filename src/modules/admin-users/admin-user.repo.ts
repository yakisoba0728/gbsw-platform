import { prisma } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";

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
    // 목록에서만 명단에서 빠진 계정을 뺀다. 상세는 그대로 볼 수 있다.
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

export async function findById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
  });
}

/** 상세 화면이 쓰는 전체 정보. deletedAt으로 거르지 않는다 — 목록에서만 뺀다. */
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

/** 이 계정이 남겼거나 이 계정을 대상으로 한 기록. */
export async function findRelatedAudit(userId: string, take: number) {
  return prisma.auditLog.findMany({
    where: { OR: [{ actorUserId: userId }, { targetId: userId }] },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** 이메일이 이미 다른 계정에 쓰이고 있을 때. */
export class EmailTakenError extends Error {}

/** 이 반·번호가 이미 다른 학생에게 배정돼 있을 때. 실물은 core/db에 하나뿐이다. */
export { NumberTakenError };

export type UpdateUserAndEnrollmentInput = {
  /** 이름·이메일·전화번호. 안 바뀌었으면 null — 문장 자체를 안 만든다. */
  profile: { name: string; email: string; phone: string } | null;
  /** 생년월일. 학적과 무관하게 학생이면 언제나 고칠 수 있다. */
  studentProfile: { studentProfileId: string; birthDate: Date } | null;
  /** 학년·반·번호 — 재학 중인 학생만 대상이다. 안 바뀌었으면 null. */
  enrollment: {
    studentProfileId: string;
    year: number;
    grade: number;
    classNo: number;
    number: number;
  } | null;
};

/**
 * 계정 정보와 학생 신원·소속을 한 트랜잭션으로 저장한다 — 반·번호 충돌로
 * 뒷부분이 실패해도 로그인 아이디인 이메일만 먼저 바뀌는 일이 없어야 한다.
 */
export async function updateUserAndEnrollment(
  userId: string,
  input: UpdateUserAndEnrollmentInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (input.profile) {
      try {
        await tx.user.update({ where: { id: userId }, data: input.profile });
      } catch (error) {
        // 미리 조회해 검사하면 그 사이에 끼어드는 요청을 못 막는다. 유일 제약이
        // 진짜 방어선이라 위반을 잡아서 옮긴다.
        if (isUniqueViolation(error, "email")) throw new EmailTakenError();
        throw error;
      }
    }

    if (input.studentProfile) {
      await tx.studentProfile.update({
        where: { id: input.studentProfile.studentProfileId },
        data: { birthDate: input.studentProfile.birthDate },
      });
    }

    if (input.enrollment) {
      const { studentProfileId, year, grade, classNo, number } = input.enrollment;

      const schoolClass = await tx.schoolClass.upsert({
        where: { year_grade_classNo: { year, grade, classNo } },
        create: { year, grade, classNo },
        update: {},
      });

      try {
        await tx.enrollment.upsert({
          where: { studentProfileId_year: { studentProfileId, year } },
          create: {
            studentProfileId,
            year,
            classId: schoolClass.id,
            number,
            status: "ENROLLED",
          },
          // update에 status를 넣지 않는다 — 넣으면 졸업생의 신원만 고치는 경로가
          // 여기 닿았을 때 학적이 재학으로 되돌아간다.
          update: { classId: schoolClass.id, number },
        });
      } catch (error) {
        if (isUniqueViolation(error, "number")) throw new NumberTakenError();
        throw error;
      }
    }
  });
}

/**
 * 계정을 활성/비활성으로 바꾼다. 비활성화는 세션 삭제까지 한 트랜잭션으로 묶는다 —
 * 중간에 실패하면 비활성인데 세션은 살아 있는 상태가 된다.
 */
export async function setActive(userId: string, active: boolean): Promise<void> {
  if (active) {
    await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: "INACTIVE" } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
}

/**
 * 비밀번호 교체 + 다음 로그인 강제 변경 표시 + 세션 삭제를 한 트랜잭션으로 묶는다.
 * 비밀번호 로그인 수단이 없으면 아무것도 바꾸지 않고 0을 돌려준다.
 */
export async function resetCredential(
  userId: string,
  passwordHash: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (count === 0) return 0;

    await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } });
    return count;
  });
}

/**
 * 완전 삭제 (오등록 정리 전용). 학적·상벌점도 Cascade로 함께 사라진다.
 * 명단 반영의 소프트 삭제는 절대 이 함수를 부르지 않는다.
 */
export async function deletePermanently(userId: string): Promise<void> {
  await prisma.$transaction([
    // createdById는 Restrict + non-null이라 먼저 지우지 않으면 user.delete가 막힌다.
    prisma.invite.deleteMany({ where: { createdById: userId } }),
    // usedById는 SetNull이라 안 지워도 되지만, metadata에 남는 이름·생년월일을 없앤다.
    prisma.invite.deleteMany({ where: { usedById: userId } }),
    // studentId로 달린 학부모 코드는 StudentProfile Cascade가 함께 지운다.
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
