import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 한 반에 같은 번호가 이미 있을 때. (admin-user.repo의 같은 이름과 짝을 이룬다) */
export class NumberTakenError extends Error {}

/**
 * 그 학년도의 학생 전원. 소속이 아직 없는 학생도 포함한다 —
 * 학년도가 막 넘어가면 전원이 배정 없는 상태이고, 그때 이 화면에서 채워야 한다.
 */
export async function listByYear(year: number) {
  const profiles = await prisma.studentProfile.findMany({
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true, email: true, status: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          status: true,
          schoolClass: { select: { grade: true, classNo: true } },
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
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      // 배정이 없으면 아직 아무 학적도 아니다. 화면에서 재학으로 채우게 둔다.
      status: e?.status ?? null,
    };
  });
}

/**
 * 한 학생의 소속·학적과 계정 상태를 **한 트랜잭션에서** 바꾼다.
 *
 * 둘을 따로 쓰면 학적만 졸업으로 바뀌고 계정은 활성인 상태가 남을 수 있다.
 */
export async function applyChange(
  year: number,
  change: EnrollmentChange & { userId: string },
  accountActive: boolean,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      let classId: string | null = null;

      if (change.grade !== null && change.classNo !== null) {
        const schoolClass = await tx.schoolClass.upsert({
          where: {
            year_grade_classNo: {
              year,
              grade: change.grade,
              classNo: change.classNo,
            },
          },
          create: { year, grade: change.grade, classNo: change.classNo },
          update: {},
        });
        classId = schoolClass.id;
      }

      await tx.enrollment.upsert({
        where: {
          studentProfileId_year: {
            studentProfileId: change.studentProfileId,
            year,
          },
        },
        create: {
          studentProfileId: change.studentProfileId,
          year,
          classId,
          number: change.number,
          status: change.status,
        },
        update: { classId, number: change.number, status: change.status },
      });

      await tx.user.update({
        where: { id: change.userId },
        data: { status: accountActive ? "ACTIVE" : "INACTIVE" },
      });

      // 비활성으로 넘어가면 남아 있는 세션도 끊는다.
      if (!accountActive) {
        await tx.session.deleteMany({ where: { userId: change.userId } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
