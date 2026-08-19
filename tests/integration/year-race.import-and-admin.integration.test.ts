import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { prisma } from "@/core/db/client";
import type { SessionUser } from "@/core/auth/session";
import { updateUser } from "@/modules/admin-users/admin-user.service";
import {
  applyRosterPlan,
  createRosterFingerprint,
} from "@/modules/enrollment/roster.service";
import { listExisting } from "@/modules/enrollment/roster.repo";
import type { RosterRow } from "@/modules/enrollment/roster.parse";

vi.mock("server-only", () => ({}));

const FALLBACK_CURRENT_YEAR = 2026;
const ADMIN_RACE_FROM_YEAR = 8132;
const ADMIN_RACE_TO_YEAR = 8133;
const ROSTER_RACE_FROM_YEAR = 8134;
const ROSTER_RACE_TO_YEAR = 8135;

const created = {
  userIds: [] as string[],
  academicYears: [] as number[],
};

function adminUser(id: string): SessionUser {
  return {
    id,
    name: "학년도 경합 관리자",
    email: `year-race-admin-${id}@example.invalid`,
    role: "ADMIN",
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

async function setOnlyCurrentYear(year: number) {
  await prisma.academicYear.createMany({
    data: [{ year, isCurrent: false }],
    skipDuplicates: true,
  });
  await prisma.academicYear.updateMany({ data: { isCurrent: false } });
  await prisma.academicYear.update({ where: { year }, data: { isCurrent: true } });
}

async function switchYearWhileHoldingLock(fromYear: number, toYear: number) {
  await prisma.academicYear.createMany({
    data: [
      { year: fromYear, isCurrent: false },
      { year: toYear, isCurrent: false },
    ],
    skipDuplicates: true,
  });
  await setOnlyCurrentYear(fromYear);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let committed = false;

  await client.query("BEGIN");
  await client.query('SELECT "year" FROM "AcademicYear" ORDER BY "year" FOR UPDATE');
  await client.query('UPDATE "AcademicYear" SET "isCurrent" = false WHERE "isCurrent"');
  await client.query('UPDATE "AcademicYear" SET "isCurrent" = true WHERE "year" = $1', [
    toYear,
  ]);

  return {
    async commit() {
      await client.query("COMMIT");
      committed = true;
      await client.end();
    },
    async cleanup() {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}

function toRosterRow(student: Awaited<ReturnType<typeof listExisting>>[number]): RosterRow {
  return {
    line: 2,
    studentCode: student.studentCode,
    name: student.name,
    birthDate: student.birthDate,
    grade: student.grade,
    classNo: student.classNo,
    number: student.number,
    status: student.status as RosterRow["status"],
    errors: [],
  };
}

async function createAdmin(id: string) {
  created.userIds.push(id);
  await prisma.user.create({
    data: {
      id,
      name: "학년도 경합 관리자",
      email: `year-race-admin-${id}@example.invalid`,
      phone: "010-8800-0001",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
}

async function createStudent(year: number, tag: string) {
  const userId = randomUUID();
  const studentCode = `YR${tag}${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
  created.userIds.push(userId);
  await prisma.academicYear.createMany({
    data: [{ year, isCurrent: false }],
    skipDuplicates: true,
  });
  const schoolClass = await prisma.schoolClass.upsert({
    where: { year_grade_classNo: { year, grade: 1, classNo: 1 } },
    create: { year, grade: 1, classNo: 1 },
    update: {},
  });

  await prisma.user.create({
    data: {
      id: userId,
      name: `학년도학생${tag}`,
      email: `year-race-student-${tag}-${userId}@example.invalid`,
      phone: `010-8800-${tag === "ADM" ? "1001" : "2001"}`,
      role: "STUDENT",
      status: "ACTIVE",
      studentProfile: {
        create: {
          studentCode,
          birthDate: new Date("2010-03-04T00:00:00+09:00"),
              enrollments: {
                create: {
                  year,
                  classId: schoolClass.id,
                  number: 1,
                  status: "ENROLLED",
                },
              },
        },
      },
    },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
      studentProfile: { select: { id: true } },
    },
  });

  return {
    user,
    studentProfileId: user.studentProfile!.id,
  };
}

afterEach(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: created.userIds } },
        { targetId: { in: created.userIds } },
        { targetId: { in: created.academicYears.map(String) } },
      ],
    },
  });
  await prisma.invite.deleteMany({ where: { createdById: { in: created.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  if (created.academicYears.length > 0) {
    await setOnlyCurrentYear(FALLBACK_CURRENT_YEAR);
    await prisma.schoolClass.deleteMany({
      where: { year: { in: created.academicYears } },
    });
    await prisma.academicYear.deleteMany({
      where: { year: { in: created.academicYears } },
    });
  }

  created.userIds = [];
  created.academicYears = [];
});

describe("현재 학년도 전환과 확정 저장 경합", () => {
  it("관리자 학생 소속 수정은 전환이 먼저 커밋되면 구년도 Enrollment를 수정하지 않는다", async () => {
    created.academicYears.push(ADMIN_RACE_FROM_YEAR, ADMIN_RACE_TO_YEAR);
    const adminId = randomUUID();
    await createAdmin(adminId);
    const { user } = await createStudent(ADMIN_RACE_FROM_YEAR, "ADM");

    const switcher = await switchYearWhileHoldingLock(
      ADMIN_RACE_FROM_YEAR,
      ADMIN_RACE_TO_YEAR,
    );
    const update = updateUser(adminUser(adminId), user.id, {
      updatedAt: user.updatedAt,
      name: user.name,
      email: user.email,
      phone: user.phone,
      birthDate: "2010-03-04",
      grade: 2,
      classNo: 1,
      number: 1,
    }).then(
      () => null,
      (error: unknown) => error,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await switcher.commit();
    expect(await update).toMatchObject({ message: "YEAR_CHANGED" });
    await switcher.cleanup();

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: {
        studentProfileId_year: {
          studentProfileId: user.studentProfile!.id,
          year: ADMIN_RACE_FROM_YEAR,
        },
      },
      select: {
        number: true,
        schoolClass: { select: { grade: true, classNo: true } },
      },
    });
    expect(enrollment).toMatchObject({
      number: 1,
      schoolClass: { grade: 1, classNo: 1 },
    });
  });

  it("명단 확정은 전환이 먼저 커밋되면 구년도 삭제·초대·반영을 커밋하지 않는다", async () => {
    created.academicYears.push(ROSTER_RACE_FROM_YEAR, ROSTER_RACE_TO_YEAR);
    const adminId = randomUUID();
    await createAdmin(adminId);
    const { user, studentProfileId } = await createStudent(ROSTER_RACE_FROM_YEAR, "RST");

    const existing = await listExisting(ROSTER_RACE_FROM_YEAR);
    const rows = existing
      .filter((student) => student.studentProfileId !== studentProfileId)
      .map(toRosterRow);
    rows.push({
      line: rows.length + 2,
      studentCode: "",
      name: "학년도신규학생",
      birthDate: "2011-05-06",
      grade: 1,
      classNo: 2,
      number: 30,
      status: "ENROLLED",
      errors: [],
    });

    const switcher = await switchYearWhileHoldingLock(
      ROSTER_RACE_FROM_YEAR,
      ROSTER_RACE_TO_YEAR,
    );
    const apply = applyRosterPlan(
      adminUser(adminId),
      ROSTER_RACE_FROM_YEAR,
      rows,
      createRosterFingerprint(existing),
      [studentProfileId],
      1,
    ).then(
      () => null,
      (error: unknown) => error,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await switcher.commit();
    expect(await apply).toMatchObject({ message: "YEAR_CHANGED" });
    await switcher.cleanup();

    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toBeTruthy();
    await expect(
      prisma.enrollment.findUniqueOrThrow({
        where: {
          studentProfileId_year: {
            studentProfileId,
            year: ROSTER_RACE_FROM_YEAR,
          },
        },
      }),
    ).resolves.toBeTruthy();
    expect(
      await prisma.invite.count({
        where: { createdById: adminId, role: "STUDENT" },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: adminId,
          action: "enrollment:import",
          targetId: String(ROSTER_RACE_FROM_YEAR),
        },
      }),
    ).toBe(0);
  });
});
