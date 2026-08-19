import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 기존 import 경로를 깨지 않기 위해 re-export한다. 실물은 core/db에 하나뿐이다. */
export { NumberTakenError };

/** 저장 트랜잭션 안에서 현재 학년도를 다시 대조하기 위한 가벼운 조회. */
export async function findCurrentYear(db: DbClient = prisma): Promise<number | null> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

/**
 * 그 학년도의 학생 전원. 배정이 없는 학생도 포함한다 — 학년도가 막 넘어가면
 * 전원이 그 상태다. 관리자로 승격된 계정은 프로필이 남아 있어도 뺀다.
 */
export async function listByYear(year: number, db: DbClient = prisma) {
  const profiles = await db.studentProfile.findMany({
    // 표 편집은 지금 다니는 학생을 다루는 화면이라 명단에서 빠진 학생은 뺀다.
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
      enrollmentUpdatedAt: e?.updatedAt ?? null,
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      // 배정이 없으면 아직 아무 학적도 아니다. 화면에서 재학으로 채우게 둔다.
      status: e?.status ?? null,
    };
  });
}

/** applyAll에 넘기는 한 학생분의 반영 내용. 검증·정리는 서비스가 이미 끝낸 상태다. */
export type PlannedEnrollment = Omit<EnrollmentChange, "expectedUpdatedAt"> & {
  userId: string;
  /** 계정이 최종적으로 활성이어야 하는지. statusChanged가 false면 안 쓴다. */
  accountActive: boolean;
  /** 학적(status)이 실제로 바뀌는 항목인지. false면 user.status를 건드리지 않는다. */
  statusChanged: boolean;
};

/**
 * 고친 학생 전원의 소속·학적과 계정 상태를 단일 트랜잭션으로 반영한다 — 중간에
 * 터져도 앞선 학생만 커밋되면 안 된다. 계정은 statusChanged인 항목만 건드린다.
 */
export async function applyAll(
  year: number,
  items: PlannedEnrollment[],
  db?: DbClient,
): Promise<void> {
  const run = async (tx: DbClient) => {
    for (const item of items) {
      let classId: string | null = null;

      if (item.grade !== null && item.classNo !== null) {
        const schoolClass = await tx.schoolClass.upsert({
          where: {
            year_grade_classNo: {
              year,
              grade: item.grade,
              classNo: item.classNo,
            },
          },
          create: { year, grade: item.grade, classNo: item.classNo },
          update: {},
        });
        classId = schoolClass.id;
      }

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
          classId,
          number: item.number,
          status: item.status,
        },
        update: { classId, number: item.number, status: item.status },
      });

      if (item.statusChanged) {
        await tx.user.update({
          where: { id: item.userId },
          data: { status: item.accountActive ? "ACTIVE" : "INACTIVE" },
        });

        // 비활성으로 넘어가면 남아 있는 세션도 끊는다.
        if (!item.accountActive) {
          await tx.session.deleteMany({ where: { userId: item.userId } });
        }
      } else {
        // User.updatedAt은 사용자 상세 편집의 aggregate revision이다. 재적만 바뀌어도
        // 이를 올려 오래된 상세 폼이 최신 명단 변경을 되돌리지 못하게 한다.
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
      // 500행 상한 × 학생당 최대 4개 문장 — 기본 5초 타임아웃으로는 부족할 수 있다.
      { timeout: 30_000, maxWait: 5_000 },
    );
  } catch (error) {
    // 사전 검사를 빠져나간 경합에 대한 마지막 방어선.
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
