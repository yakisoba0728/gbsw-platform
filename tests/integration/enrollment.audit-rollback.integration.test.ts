import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "@/core/audit/audit";
import { prisma, withTransaction } from "@/core/db/client";
import { applyAll } from "@/modules/enrollment/enrollment.repo";

const YEAR = 8200 + Math.floor(Math.random() * 10_000);

describe("applyAll() + 감사로그 원자성", () => {
  const studentAUserId = randomUUID();
  const studentBUserId = randomUUID();
  const sessionId = randomUUID();
  const missingActorId = randomUUID();
  let classId: string;
  let profileAId: string;
  let profileBId: string;

  beforeAll(async () => {
    await prisma.academicYear.create({ data: { year: YEAR } });
    const schoolClass = await prisma.schoolClass.create({
      data: { year: YEAR, grade: 1, classNo: 1 },
    });
    classId = schoolClass.id;

    await prisma.user.createMany({
      data: [
        {
          id: studentAUserId,
          name: "원자성 학생A",
          email: `itest-enroll-a-${studentAUserId}@example.invalid`,
          phone: "010-0000-6101",
          role: "STUDENT",
          status: "ACTIVE",
        },
        {
          id: studentBUserId,
          name: "원자성 학생B",
          email: `itest-enroll-b-${studentBUserId}@example.invalid`,
          phone: "010-0000-6102",
          role: "STUDENT",
          status: "ACTIVE",
        },
      ],
    });

    const profileA = await prisma.studentProfile.create({
      data: {
        userId: studentAUserId,
        studentCode: `IEA${randomUUID().slice(0, 8).toUpperCase()}`,
        birthDate: new Date("2010-01-01T00:00:00+09:00"),
      },
    });
    profileAId = profileA.id;

    const profileB = await prisma.studentProfile.create({
      data: {
        userId: studentBUserId,
        studentCode: `IEB${randomUUID().slice(0, 8).toUpperCase()}`,
        birthDate: new Date("2010-01-02T00:00:00+09:00"),
      },
    });
    profileBId = profileB.id;

    await prisma.enrollment.createMany({
      data: [
        {
          studentProfileId: profileAId,
          year: YEAR,
          classId,
          number: 1,
          status: "ENROLLED",
        },
        {
          studentProfileId: profileBId,
          year: YEAR,
          classId,
          number: 2,
          status: "ENROLLED",
        },
      ],
    });

    await prisma.session.create({
      data: {
        id: sessionId,
        token: `itest-enroll-session-${sessionId}`,
        userId: studentAUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { year: YEAR } });
    await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentAUserId, studentBUserId] } } });
    await prisma.schoolClass.deleteMany({ where: { id: classId } });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("학생별 감사 실패가 학적 일괄 반영 전체를 롤백한다", async () => {
    await expect(
      withTransaction(async (tx) => {
        await applyAll(
          YEAR,
          [
            {
              studentProfileId: profileAId,
              userId: studentAUserId,
              grade: null,
              classNo: null,
              number: null,
              status: "WITHDRAWN",
              accountActive: false,
              statusChanged: true,
            },
            {
              studentProfileId: profileBId,
              userId: studentBUserId,
              grade: 1,
              classNo: 1,
              number: 5,
              status: "ENROLLED",
              accountActive: true,
              statusChanged: false,
            },
          ],
          tx,
        );

        await recordAudit(
          {
            actorUserId: missingActorId,
            actorName: "없는 관리자",
            action: "enrollment:update",
            targetType: "StudentProfile",
            targetId: profileAId,
          },
          tx,
        );
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const [a, b, userA, session, audit] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { studentProfileId_year: { studentProfileId: profileAId, year: YEAR } },
      }),
      prisma.enrollment.findUnique({
        where: { studentProfileId_year: { studentProfileId: profileBId, year: YEAR } },
      }),
      prisma.user.findUnique({ where: { id: studentAUserId } }),
      prisma.session.findUnique({ where: { id: sessionId } }),
      prisma.auditLog.findFirst({
        where: { action: "enrollment:update", targetType: "StudentProfile", targetId: profileAId },
      }),
    ]);

    expect(a).toMatchObject({ classId, number: 1, status: "ENROLLED" });
    expect(b).toMatchObject({ classId, number: 2, status: "ENROLLED" });
    expect(userA?.status).toBe("ACTIVE");
    expect(session).not.toBeNull();
    expect(audit).toBeNull();
  });
});
