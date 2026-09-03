import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import { NumberTakenError } from "@/modules/student/student-position";
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

export type PlannedSeat = {
  grade: number;
  classNo: number;
  number: number;
};

/**
 * 소프트삭제된 학생이 당해 학년도에 남겨둔 학적 행을 지정한 자리에서 지운다.
 *
 * 정책 근거:
 * - User 행은 소프트삭제를 유지한다. 상벌점·출입증·학부모 연결 등 사용자 기록은
 *   보존하는 것이 원칙이며(prisma/schema.prisma의 User.deletedAt 주석), 계정은
 *   명단 반영 경로와 같은 방식으로 언제든 복구된다.
 * - Enrollment 행은 학년도 자리 배정 값이지 업무 기록이 아니다. 명단 반영 경로도
 *   명단에서 빠진(소프트삭제된) 학생의 당해 학년도 학적 행을 deleteMany로 지우고
 *   파일에 있는 배정만 다시 만들므로(roster.repo.applyRoster), 같은 정책을 따른다.
 * - 자리를 비워 두기(좌석 필드만 null)를 선택하지 않은 이유: status가 ENROLLED인
 *   채 좌석이 null인 행은 "재학이면 학년·반·번호가 모두 있어야 한다"는 불변식을
 *   깨고, 화면 어디에도 노출되지 않는 행을 영구히 남기게 된다. 참고로 User 완전
 *   삭제 시에도 onDelete: Cascade로 Enrollment 행은 함께 사라진다.
 */
export async function deleteEnrollmentsOfRemovedStudents(
  year: number,
  seats: PlannedSeat[],
  db: DbClient = prisma,
): Promise<void> {
  if (seats.length === 0) return;

  await db.enrollment.deleteMany({
    where: {
      year,
      studentProfile: { user: { deletedAt: { not: null } } },
      OR: seats.map((seat) => ({
        grade: seat.grade,
        classNo: seat.classNo,
        number: seat.number,
      })),
    },
  });
}

export async function applyAll(
  year: number,
  items: PlannedEnrollment[],
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    if (items.length > 0) {
      // 자리 이동·교환의 중간 상태가 (year, grade, classNo, number) 유니크 제약과
      // 부딪치지 않게, 최종 값을 쓰기 전에 이번 배치 학생들의 자리를 먼저 비운다.
      // Postgres의 NULL은 서로 달라 비어 있는 행끼리는 충돌하지 않는다.
      // 명단 반영 경로(roster.repo.applyRoster)가 delete 후 create로 배정을
      // 다시 만드는 것과 같은 취지다.
      await tx.enrollment.updateMany({
        where: { year, studentProfileId: { in: items.map((item) => item.studentProfileId) } },
        data: { grade: null, classNo: null, number: null },
      });
    }

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
