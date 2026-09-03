import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import {
  revokePendingByTargets,
  type RevokedInviteInfo,
} from "@/modules/invites/invite.repo";
import { NumberTakenError } from "@/modules/student/student-position";
import type { PlannedRow } from "./roster.plan";

export { findCurrentYearForUpdate, findCurrentYear } from "@/modules/academic-year/academic-year.repo";

export { NumberTakenError };

export async function listExisting(year: number, db: DbClient = prisma) {
  const profiles = await db.studentProfile.findMany({
    // 제외된 학생도 학생코드 재매칭에는 필요하다. 내보내기에서만 거른다.
    where: { user: { role: "STUDENT" } },
    select: {
      id: true,
      studentCode: true,
      birthDate: true,
      user: { select: { id: true, name: true, status: true, deletedAt: true } },
      enrollments: {
        where: { OR: [{ year }, { status: "GRADUATED" }] },
        select: {
          year: true,
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });

  return profiles.map((p) => {
    const e = p.enrollments.find((enrollment) => enrollment.year === year);
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      studentCode: p.studentCode,
      name: p.user.name.normalize("NFC"),
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.grade ?? null,
      classNo: e?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
      hasGraduatedEnrollment: p.enrollments.some(
        (enrollment) => enrollment.status === "GRADUATED",
      ),
      accountActive: p.user.status === "ACTIVE",
      removed: p.user.deletedAt !== null,
    };
  });
}

// 전 학년도 입학반 조회는 확정 트랜잭션의 학년도 잠금 밖에서만 수행한다.
export async function listForExport(year: number) {
  const [students, entryByProfile] = await Promise.all([
    listExisting(year),
    entrySeats(prisma),
  ]);

  return students.filter((student) => !student.removed).map((student) => {
    const entry = entryByProfile.get(student.studentProfileId);
    return {
      ...student,
      entryClassNo: entry?.classNo ?? null,
      entryNumber: entry?.number ?? null,
    };
  });
}

async function entrySeats(
  db: DbClient,
): Promise<Map<string, { classNo: number; number: number }>> {
  const rows = await db.enrollment.findMany({
    where: { grade: 1 },
    orderBy: { year: "asc" },
    select: {
      studentProfileId: true,
      classNo: true,
      number: true,
    },
  });

  const map = new Map<string, { classNo: number; number: number }>();
  for (const r of rows) {
    if (map.has(r.studentProfileId)) continue;
    if (r.classNo !== null && r.number !== null) {
      map.set(r.studentProfileId, { classNo: r.classNo, number: r.number });
    }
  }
  return map;
}

export type RosterAssignment = PlannedRow & {
  statusChanged: boolean;
};

export type ApplyInput = {
  assignments: RosterAssignment[];
  managedStudentProfileIds: string[];
  /** 명단에서 빠져 계정만 비활성·제외 표시할 학생. 업무 기록은 보존한다. */
  deleteStudentProfileIds: string[];
};

export type ApplyRosterResult = {
  revokedInvites: RevokedInviteInfo[];
};

export async function applyRoster(year: number, input: ApplyInput, db?: DbClient) {
  const run = async (tx: DbClient): Promise<ApplyRosterResult> => {
    let revokedInvites: RevokedInviteInfo[] = [];
    const revisionStamp = new Date();

    if (input.deleteStudentProfileIds.length > 0) {
      const targets = await tx.studentProfile.findMany({
        where: {
          id: { in: input.deleteStudentProfileIds },
          user: { role: "STUDENT" },
          enrollments: { none: { status: "GRADUATED" } },
        },
        select: { id: true, userId: true },
      });
      const deleteUserIds = targets.map((t) => t.userId);
      const deleteProfileIds = targets.map((t) => t.id);

      // Invite 테이블의 폐기는 초대 도메인(invites)에 맡긴다.
      revokedInvites = await revokePendingByTargets(
        { usedByIds: deleteUserIds, studentIds: deleteProfileIds },
        tx,
      );

      if (deleteUserIds.length > 0) {
        // 스프레드시트 한 줄로 상벌점·출입증·학부모 연결이 사라지지 않게 한다.
        await tx.user.updateMany({
          where: { id: { in: deleteUserIds } },
          data: {
            status: "INACTIVE",
            deletedAt: revisionStamp,
            updatedAt: revisionStamp,
          },
        });
        await tx.session.deleteMany({ where: { userId: { in: deleteUserIds } } });
      }
    }

    // 번호 교환의 중간 유일 제약 충돌을 피한다. 장기 참조는 Enrollment.id가 아닌 StudentProfile.id를 쓴다.
    await tx.enrollment.deleteMany({
      where: { year, studentProfileId: { in: input.managedStudentProfileIds } },
    });

    // 잠금 시간은 전교 다른 쓰기에 영향을 주므로 행별 왕복을 피한다.
    await tx.enrollment.createMany({
      data: input.assignments.map((row) => ({
        studentProfileId: row.studentProfileId!,
        year,
        grade: row.grade,
        classNo: row.classNo,
        number: row.number,
        status: row.status!,
      })),
    });

    const changed = input.assignments.filter((r) => r.statusChanged);
    const inactive = changed
      .filter((r) => r.status !== "ENROLLED")
      .map((r) => r.studentProfileId!);
    const active = changed
      .filter((r) => r.status === "ENROLLED")
      .map((r) => r.studentProfileId!);

    if (inactive.length > 0) {
      const users = await tx.studentProfile.findMany({
        where: { id: { in: inactive } },
        select: { userId: true },
      });
      const ids = users.map((u) => u.userId);
      await tx.user.updateMany({
        where: { id: { in: ids } },
        data: { status: "INACTIVE", deletedAt: null, updatedAt: revisionStamp },
      });
      await tx.session.deleteMany({ where: { userId: { in: ids } } });
    }
    if (active.length > 0) {
      const users = await tx.studentProfile.findMany({
        where: { id: { in: active } },
        select: { userId: true },
      });
      await tx.user.updateMany({
        where: { id: { in: users.map((u) => u.userId) } },
        data: { status: "ACTIVE", deletedAt: null, updatedAt: revisionStamp },
      });
    }

    const revisionOnlyProfileIds = input.assignments
      .filter((r) => !r.statusChanged && r.line !== 0)
      .map((r) => r.studentProfileId!);
    if (revisionOnlyProfileIds.length > 0) {
      const users = await tx.studentProfile.findMany({
        where: { id: { in: revisionOnlyProfileIds } },
        select: { userId: true },
      });
      await tx.user.updateMany({
        where: { id: { in: users.map((u) => u.userId) } },
        data: { updatedAt: revisionStamp },
      });
    }

    // 새 학생 초대 발급은 invites 모듈의 bulk 진입점이 트랜잭션 안에서 담당한다.
    return { revokedInvites };
  };

  try {
    if (db) return await run(db);

    return await withTransaction(
      run,
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
