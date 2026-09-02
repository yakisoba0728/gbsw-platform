import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

const YEAR = 8102;

describe("applyRoster() — 명단에서 빠진 학생은 기록을 보존한 채 제외된다", () => {
  const adminId = randomUUID();
  const studentUserId = randomUUID();
  const parentUserId = randomUUID();
  const sessionId = randomUUID();
  const studentCode = `ITST${randomUUID().slice(0, 4).toUpperCase()}`;
  const pendingByStudentCode = `ITPS${randomUUID().slice(0, 8).toUpperCase()}`;
  const pendingByAdminCode = `ITPA${randomUUID().slice(0, 8).toUpperCase()}`;
  const usedCode = `ITUS${randomUUID().slice(0, 8).toUpperCase()}`;
  let studentProfileId: string;
  let parentStudentId: string;

  beforeAll(async () => {
    await prisma.academicYear.create({ data: { year: YEAR } });

    await prisma.user.create({
      data: {
        id: adminId,
        name: "통합테스트 관리자",
        email: `itest-admin-${adminId}@example.invalid`,
        phone: "010-0000-1001",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await prisma.user.create({
      data: {
        id: studentUserId,
        name: "통합테스트 학생",
        email: `itest-student-${studentUserId}@example.invalid`,
        phone: "010-0000-1002",
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: studentUserId,
        studentCode,
        birthDate: new Date("2010-01-01T00:00:00+09:00"),
      },
    });
    studentProfileId = profile.id;

    await prisma.enrollment.create({
      data: {
        studentProfileId,
        year: YEAR,
        grade: null,
        classNo: null,
        number: null,
        status: "ENROLLED",
      },
    });

    await prisma.session.create({
      data: {
        id: sessionId,
        token: `itest-token-${sessionId}`,
        userId: studentUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await prisma.user.create({
      data: {
        id: parentUserId,
        name: "통합테스트 학부모",
        email: `itest-parent-${parentUserId}@example.invalid`,
        phone: "010-0000-1003",
        role: "PARENT",
        status: "ACTIVE",
      },
    });
    const link = await prisma.parentStudent.create({
      data: { parentUserId, studentId: studentProfileId },
    });
    parentStudentId = link.id;

    await prisma.invite.createMany({
      data: [
        {
          code: pendingByStudentCode,
          role: "PARENT",
          status: "PENDING",
          createdById: studentUserId,
          createdByName: "통합테스트 학생",
          studentId: studentProfileId,
        },
        {
          code: pendingByAdminCode,
          role: "PARENT",
          status: "PENDING",
          createdById: adminId,
          createdByName: "통합테스트 관리자",
          studentId: studentProfileId,
        },
        {
          code: usedCode,
          role: "PARENT",
          status: "USED",
          createdById: adminId,
          createdByName: "통합테스트 관리자",
          studentId: studentProfileId,
          usedById: parentUserId,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.invite.deleteMany({
      where: { code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] } },
    });
    await prisma.parentStudent.deleteMany({ where: { id: parentStudentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [parentUserId, studentUserId, adminId] } },
    });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("계정과 업무 기록은 보존하고 로그인·현재 배정만 끊는다", async () => {
    const pendingIds = (
      await prisma.invite.findMany({
        where: {
          code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] },
          status: "PENDING",
        },
        select: { id: true },
      })
    ).map((i) => i.id).sort();

    const result = await applyRoster(YEAR, {
      assignments: [],
      newStudents: [],
      inviteExpiresAt: null,
      managedStudentProfileIds: [studentProfileId],
      deleteStudentProfileIds: [studentProfileId],
      createdById: adminId,
      createdByName: "통합테스트 관리자",
    });

    expect(result.revokedInvites.map((i) => i.id).sort()).toEqual(pendingIds);
    expect(result.revokedInvites.every((i) => i.role === "PARENT")).toBe(true);
    expect(result.revokedInvites.map((i) => i.status).sort()).toEqual(["PENDING", "PENDING"]);

    const remainingInvites = await prisma.invite.findMany({
      where: { code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] } },
      select: { code: true, status: true },
      orderBy: { code: "asc" },
    });
    expect(remainingInvites).toEqual(
      [
        { code: pendingByStudentCode, status: "REVOKED" },
        { code: pendingByAdminCode, status: "REVOKED" },
        { code: usedCode, status: "USED" },
      ].sort((a, b) => a.code.localeCompare(b.code)),
    );

    const studentUser = await prisma.user.findUnique({ where: { id: studentUserId } });
    expect(studentUser).toMatchObject({ status: "INACTIVE" });
    expect(studentUser?.deletedAt).toBeInstanceOf(Date);

    const profile = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    expect(profile).not.toBeNull();

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentProfileId_year: { studentProfileId, year: YEAR } },
    });
    expect(enrollment).toBeNull();

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session).toBeNull();

    const link = await prisma.parentStudent.findUnique({ where: { id: parentStudentId } });
    expect(link).not.toBeNull();

    const parentUser = await prisma.user.findUnique({ where: { id: parentUserId } });
    expect(parentUser?.status).toBe("ACTIVE");
  });
});
