import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import type { PlannedRow } from "./roster.plan";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 다른 repo와 같은 실물을 re-export한다 — 모듈마다 다른 클래스면 instanceof가 안 통한다. */
export { NumberTakenError };

/** 초대코드가 겹쳤을 때. 동시에 올라온 다른 반영과 경합하면 여기까지 뚫린다. */
export class InviteCodeCollisionError extends Error {}

export async function findCurrentYearForUpdate(db: DbClient): Promise<number | null> {
  await db.$queryRaw<Array<{ year: number }>>`
    SELECT "year"
    FROM "AcademicYear"
    ORDER BY "year"
    FOR UPDATE
  `;

  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

export async function findCurrentYear(db: DbClient = prisma): Promise<number | null> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
}

export async function listExisting(year: number, db: DbClient = prisma) {
  const [profiles, entryByProfile] = await Promise.all([
    db.studentProfile.findMany({
      where: { user: { role: "STUDENT", deletedAt: null } },
      select: {
        id: true,
        studentCode: true,
        birthDate: true,
        user: { select: { id: true, name: true, status: true, deletedAt: true } },
        enrollments: {
          where: { OR: [{ year }, { status: "GRADUATED" }] },
          select: {
            year: true,
            number: true,
            status: true,
            schoolClass: { select: { grade: true, classNo: true } },
          },
        },
      },
    }),
    entrySeats(db),
  ]);

  return profiles.map((p) => {
    const e = p.enrollments.find((enrollment) => enrollment.year === year);
    const entry = entryByProfile.get(p.id);
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      studentCode: p.studentCode,
      // 파일 쪽 이름(roster.parse.ts)과 같은 NFC로 맞춘다. 안 맞추면 눈엔 같은
      // 이름인데 조합형/완성형이 달라 다른 사람으로 잡힌다.
      name: p.user.name.normalize("NFC"),
      // 파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다.
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
      hasGraduatedEnrollment: p.enrollments.some(
        (enrollment) => enrollment.status === "GRADUATED",
      ),
      accountActive: p.user.status === "ACTIVE",
      deleted: p.user.deletedAt !== null,
      // 참고 열(입학반·입학번호)용. 내보내기만 쓴다.
      entryClassNo: entry?.classNo ?? null,
      entryNumber: entry?.number ?? null,
    };
  });
}

/** 참고 열용. 학생마다 가장 이른 1학년 배정을 한 번의 조회로 모은다. */
async function entrySeats(
  db: DbClient,
): Promise<Map<string, { classNo: number; number: number }>> {
  const rows = await db.enrollment.findMany({
    where: { schoolClass: { grade: 1 } },
    orderBy: { year: "asc" },
    select: {
      studentProfileId: true,
      number: true,
      schoolClass: { select: { classNo: true } },
    },
  });

  const map = new Map<string, { classNo: number; number: number }>();
  for (const r of rows) {
    // year 오름차순이라 먼저 만난 것이 가장 이른 1학년이다.
    if (map.has(r.studentProfileId)) continue;
    if (r.schoolClass && r.number !== null) {
      map.set(r.studentProfileId, { classNo: r.schoolClass.classNo, number: r.number });
    }
  }
  return map;
}

/** applyRoster에 넘기는 한 줄. 계정 상태를 건드릴지는 statusChanged가 결정한다. */
export type RosterAssignment = PlannedRow & {
  /** 학적이 실제로 달라졌는가. false면 계정 상태를 건드리지 않는다. */
  statusChanged: boolean;
};

export type ApplyInput = {
  /** 기존 학생의 그 학년도 배정 (신규 제외) */
  assignments: RosterAssignment[];
  /** 초대코드를 만들 신규 학생. 비재학 신규는 여기 오지 않는다. */
  newStudents: { row: PlannedRow; code: string }[];
  /** newStudents 전원이 공유하는 만료 시각. null이면 무기한. */
  inviteExpiresAt: Date | null;
  /**
   * 이번 반영이 관리하는 범위(role: STUDENT 전체). 아래 deleteMany를 이 범위로
   * 좁혀야 관리자로 승격돼 명단 밖으로 빠진 계정의 배정이 함께 지워지지 않는다.
   */
  managedStudentProfileIds: string[];
  /** 명단에서 빠진 학생 — 계정과 학생 기록을 DB에서 완전히 지운다. */
  deleteStudentProfileIds: string[];
  createdById: string;
};

/**
 * 명단을 반영한다.
 *
 * 그 학년도 배정을 managedStudentProfileIds 범위만큼 지우고 새로 넣는다 — 번호
 * 맞바꾸기(3↔4)를 update로는 못 한다. Postgres 유일 제약은 DEFERRABLE이 아니면
 * 문장 단위로 검사해서 한 트랜잭션 안이라도 중간 상태에서 걸린다.
 *
 * 그래서 Enrollment.id는 반영할 때마다 새로 생긴다 — 오래 남아야 하는 기록은
 * Enrollment가 아니라 StudentProfile.id를 참조해야 한다.
 */
export async function applyRoster(year: number, input: ApplyInput, db?: DbClient) {
  const run = async (tx: DbClient) => {
    /** 이번 반영이 폐기한 미사용 초대코드. 서비스가 같은 트랜잭션에서 감사로그로 옮긴다. */
    let revokedInvites: { id: string; role: string }[] = [];
    const revisionStamp = new Date();

    // 재배정을 다시 넣기 전에 실제 삭제부터 끝낸다.
    if (input.deleteStudentProfileIds.length > 0) {
      // 조회와 이 트랜잭션 사이에 관리자로 승격됐을 수 있다. role을 다시 좁힌다.
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

      revokedInvites = await tx.invite.findMany({
        where: {
          status: "PENDING",
          OR: [
            { createdById: { in: deleteUserIds } },
            { usedById: { in: deleteUserIds } },
            { studentId: { in: deleteProfileIds } },
          ],
        },
        select: { id: true, role: true },
      });

      if (deleteUserIds.length > 0) {
        // Invite.createdBy는 Restrict라 사용자 삭제 전에 끊어야 한다. usedBy와
        // studentId 쪽도 함께 지워 초대 metadata에 삭제 대상 정보가 남지 않게 한다.
        await tx.invite.deleteMany({
          where: {
            OR: [
              { createdById: { in: deleteUserIds } },
              { usedById: { in: deleteUserIds } },
              { studentId: { in: deleteProfileIds } },
            ],
          },
        });

        await tx.user.deleteMany({ where: { id: { in: deleteUserIds } } });
      }
    }

    await tx.enrollment.deleteMany({
      where: { year, studentProfileId: { in: input.managedStudentProfileIds } },
    });

    // 학생마다 upsert하면 300번 왕복한다. 필요한 반을 모아 한 번씩만 부른다.
    const neededClasses = new Map<string, { grade: number; classNo: number }>();
    for (const row of input.assignments) {
      if (row.grade !== null && row.classNo !== null) {
        neededClasses.set(`${row.grade}-${row.classNo}`, {
          grade: row.grade,
          classNo: row.classNo,
        });
      }
    }

    const classIdByKey = new Map<string, string>();
    for (const { grade, classNo } of neededClasses.values()) {
      const cls = await tx.schoolClass.upsert({
        where: { year_grade_classNo: { year, grade, classNo } },
        create: { year, grade, classNo },
        update: {},
      });
      classIdByKey.set(`${grade}-${classNo}`, cls.id);
    }

    for (const row of input.assignments) {
      const classId =
        row.grade !== null && row.classNo !== null
          ? (classIdByKey.get(`${row.grade}-${row.classNo}`) ?? null)
          : null;

      await tx.enrollment.create({
        data: {
          studentProfileId: row.studentProfileId!,
          year,
          classId,
          number: row.number,
          status: row.status!,
        },
      });
    }

    // 계정 상태를 학적에 맞춘다. statusChanged가 true인 학생만 건드린다.
    // 두 분기 모두 legacy deletedAt 표시를 지운다 — 명단에 줄이 있다는 것 자체가
    // 삭제 대상이 아니라는 뜻이다. 비재학이면 비활성은 유지한다.
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
      // 비활성으로 넘어가는 계정은 세션도 끊는다.
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

    const invites: {
      name: string;
      code: string;
      grade: number | null;
      classNo: number | null;
      number: number | null;
    }[] = [];

    for (const { row, code } of input.newStudents) {
      await tx.invite.create({
        data: {
          code,
          role: "STUDENT",
          status: "PENDING",
          createdById: input.createdById,
          expiresAt: input.inviteExpiresAt,
          // 가입 때 2차 요소로 대조하는 값. 발급 화면과 같은 모양이어야 한다.
          metadata: {
            name: row.name,
            birthDate: row.birthDate,
            grade: row.grade,
            classNo: row.classNo,
            number: row.number,
          },
        },
      });
      invites.push({
        name: row.name,
        code,
        grade: row.grade,
        classNo: row.classNo,
        number: row.number,
      });
    }

    return { invites, revokedInvites };
  };

  try {
    if (db) return await run(db);

    return await withTransaction(
      run,
      // 전교생 규모 × 학생당 두어 문장. 기본 5초로는 부족하다.
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error, "code")) throw new InviteCodeCollisionError();
    // Enrollment_classId_number_key. 명단 밖으로 빠진 계정(관리자로 승격된 학생)의
    // 그 학년도 배정은 managedStudentProfileIds 범위 밖이라 위에서 안 지워지고
    // (반, 번호) 자리를 그대로 붙들고 있다 — 그 자리에 다른 학생을 넣으면 여기로 온다.
    // 날것의 P2002로 올려보내면 화면에 "반영하지 못했습니다."만 뜨고 원인이 사라진다.
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
