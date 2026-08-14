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
  });
}

/** 이메일이 이미 다른 계정에 쓰이고 있을 때. (registration.repo의 InviteRaceError와 같은 방식) */
export class EmailTakenError extends Error {}

/**
 * 이 반·번호가 이미 다른 학생에게 배정돼 있을 때. (Enrollment_classId_number_key)
 * 기존 import 경로를 깨지 않기 위해 re-export한다. 실물은 core/db에 하나뿐이다.
 */
export { NumberTakenError };

export type UpdateUserAndEnrollmentInput = {
  /** 이름·이메일·전화번호. 안 바뀌었으면 null — 문장 자체를 안 만든다. */
  profile: { name: string; email: string; phone: string } | null;
  /**
   * 학생 소속 수정. 학급이 없으면 만든다 — 가입 때와 같은 방식이다.
   * (registration.repo의 upsert 패턴과 동일) 안 바뀌었으면 null.
   */
  enrollment: {
    studentProfileId: string;
    year: number;
    birthDate: Date;
    grade: number;
    classNo: number;
    number: number;
  } | null;
};

/**
 * 사용자 정보와 학생 소속을 **한 트랜잭션**으로 저장한다 (I1).
 *
 * 예전엔 updateProfile()과 updateEnrollment()가 서로 다른 호출이었다.
 * 이름·이메일·전화번호가 먼저 커밋된 뒤 반·번호 충돌(NumberTakenError)로
 * 두 번째 호출이 실패하면, 앞선 변경은 이미 저장된 채로 화면엔 "저장 못 함"만
 * 뜨는 반쪽짜리 저장이 됐다 — 로그인 아이디인 이메일이 흔적 없이 바뀔 수 있다는
 * 게 특히 나빴다. enrollment.repo.ts의 applyAll과 같은 패턴으로 묶는다.
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
        // 미리 조회해서 검사하면 그 사이에 끼어드는 요청을 막지 못한다.
        // 유일 제약이 진짜 방어선이므로 위반을 잡아서 옮긴다.
        if (isUniqueViolation(error, "email")) throw new EmailTakenError();
        throw error;
      }
    }

    if (input.enrollment) {
      const { studentProfileId, year, birthDate, grade, classNo, number } = input.enrollment;

      await tx.studentProfile.update({
        where: { id: studentProfileId },
        data: { birthDate },
      });

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
          // 상세에서 반·번호를 고치는 건 재학 중이라는 뜻이다. 졸업 행에 반만 채워지면 안 된다.
          update: { classId: schoolClass.id, number, status: "ENROLLED" },
        });
      } catch (error) {
        // updateProfile과 같은 이유 — 미리 조회해 봐야 그 사이에 끼어드는 요청을 못 막는다.
        if (isUniqueViolation(error, "number")) throw new NumberTakenError();
        throw error;
      }
    }
  });
}

export async function setStatus(userId: string, status: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { status } });
}

/**
 * 계정을 활성/비활성으로 바꾼다. 비활성화는 세션 삭제까지 **한 트랜잭션**으로
 * 묶는다 (M11) — 중간에 실패하면 "비활성인데 세션은 살아있음"이 된다.
 * 활성화는 되돌릴 세션이 없으므로 단일 문장이면 충분하다.
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
 * credential 계정의 비밀번호를 갈아끼우고, 다음 로그인 강제 변경 표시 +
 * 세션 삭제까지 **한 트랜잭션**으로 묶는다 (M11) — 예전엔 세 호출이 따로였다.
 * 비밀번호 로그인 수단이 없으면(count 0) 아무 것도 바꾸지 않고 0을 돌려준다.
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
