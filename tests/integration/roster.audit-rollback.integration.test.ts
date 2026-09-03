import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "@/core/audit/audit";
import { prisma, withTransaction } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

const YEAR = 8300 + Math.floor(Math.random() * 10_000);

describe("applyRoster() + 감사로그 원자성", () => {
  const adminId = randomUUID();
  const studentUserId = randomUUID();
  const sessionId = randomUUID();
  const inviteCode = `IRR${randomUUID().slice(0, 8).toUpperCase()}`;
  const missingActorId = randomUUID();
  let profileId: string;
  let inviteId: string;

  beforeAll(async () => {
    await prisma.academicYear.create({ data: { year: YEAR } });

    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          name: "원자성 관리자",
          email: `itest-roster-admin-${adminId}@example.invalid`,
          phone: "010-0000-6201",
          role: "ADMIN",
          status: "ACTIVE",
        },
        {
          id: studentUserId,
          name: "원자성 명단학생",
          email: `itest-roster-student-${studentUserId}@example.invalid`,
          phone: "010-0000-6202",
          role: "STUDENT",
          status: "ACTIVE",
        },
      ],
    });

    const profile = await prisma.studentProfile.create({
      data: {
        userId: studentUserId,
        studentCode: `IRA${randomUUID().slice(0, 8).toUpperCase()}`,
        birthDate: new Date("2010-02-01T00:00:00+09:00"),
      },
    });
    profileId = profile.id;

    await prisma.enrollment.create({
      data: {
        studentProfileId: profileId,
        year: YEAR,
        grade: 1,
        classNo: 1,
        number: 1,
        status: "ENROLLED",
      },
    });

    await prisma.session.create({
      data: {
        id: sessionId,
        token: `itest-roster-session-${sessionId}`,
        userId: studentUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const invite = await prisma.invite.create({
      data: {
        code: inviteCode,
        role: "PARENT",
        status: "PENDING",
        createdById: adminId,
        createdByName: "원자성 관리자",
        studentId: profileId,
      },
    });
    inviteId = invite.id;
  });

  afterAll(async () => {
    await prisma.invite.deleteMany({ where: { id: inviteId } });
    await prisma.enrollment.deleteMany({ where: { year: YEAR } });
    await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentUserId, adminId] } } });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("요약 감사 실패가 명단 반영과 초대폐기·소프트 삭제를 롤백한다", async () => {
    await expect(
      withTransaction(async (tx) => {
        await applyRoster(
          YEAR,
          {
            assignments: [],
            managedStudentProfileIds: [profileId],
            deleteStudentProfileIds: [profileId],
          },
          tx,
        );

        await recordAudit(
          {
            actorUserId: missingActorId,
            actorName: "없는 관리자",
            action: "enrollment:import",
            targetType: "AcademicYear",
            targetId: String(YEAR),
          },
          tx,
        );
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const [enrollment, user, session, invite, audit] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { studentProfileId_year: { studentProfileId: profileId, year: YEAR } },
      }),
      prisma.user.findUnique({ where: { id: studentUserId } }),
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.invite.findUnique({ where: { id: inviteId } }),
      prisma.auditLog.findFirst({
        where: { action: "enrollment:import", targetType: "AcademicYear", targetId: String(YEAR) },
      }),
    ]);

    expect(enrollment).toMatchObject({
      grade: 1,
      classNo: 1,
      number: 1,
      status: "ENROLLED",
    });
    expect(user?.status).toBe("ACTIVE");
    expect(user?.deletedAt).toBeNull();
    expect(session).not.toBeNull();
    expect(invite?.status).toBe("PENDING");
    expect(audit).toBeNull();
  });
});
