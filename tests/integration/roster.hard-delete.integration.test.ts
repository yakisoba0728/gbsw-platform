import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

const YEAR = 8102;
const GRADUATION_YEAR = YEAR - 1;

describe("applyRoster() — 학생 영구 삭제와 졸업 보존", () => {
  const adminId = randomUUID();
  const deletedUserId = randomUUID();
  const graduatedUserId = randomUUID();
  const parentUserId = randomUUID();
  const sessionId = randomUUID();
  const pendingCode = `ITPD${randomUUID().slice(0, 8).toUpperCase()}`;
  let meritRuleId = "";
  let meritAwardId = "";
  let deletedProfileId = "";
  let graduatedProfileId = "";

  beforeAll(async () => {
    await prisma.academicYear.createMany({
      data: [{ year: GRADUATION_YEAR }, { year: YEAR }],
    });
    await prisma.user.createMany({
      data: [
        { id: adminId, name: "관리자", email: `${adminId}@example.invalid`, phone: "010-8200-0001", role: "ADMIN", status: "ACTIVE" },
        { id: deletedUserId, name: "삭제 학생", email: `${deletedUserId}@example.invalid`, phone: "010-8200-0002", role: "STUDENT", status: "ACTIVE" },
        { id: graduatedUserId, name: "졸업 학생", email: `${graduatedUserId}@example.invalid`, phone: "010-8200-0003", role: "STUDENT", status: "INACTIVE" },
        { id: parentUserId, name: "학부모", email: `${parentUserId}@example.invalid`, phone: "010-8200-0004", role: "PARENT", status: "ACTIVE" },
      ],
    });
    const [deleted, graduated] = await Promise.all([
      prisma.studentProfile.create({
        data: { userId: deletedUserId, studentCode: `ITD${randomUUID().slice(0, 5).toUpperCase()}`, birthDate: new Date("2010-01-01T00:00:00+09:00") },
      }),
      prisma.studentProfile.create({
        data: { userId: graduatedUserId, studentCode: `ITG${randomUUID().slice(0, 5).toUpperCase()}`, birthDate: new Date("2007-01-01T00:00:00+09:00") },
      }),
    ]);
    deletedProfileId = deleted.id;
    graduatedProfileId = graduated.id;
    await prisma.enrollment.createMany({
      data: [
        { studentProfileId: deletedProfileId, year: YEAR, status: "ENROLLED" },
        {
          studentProfileId: graduatedProfileId,
          year: GRADUATION_YEAR,
          status: "GRADUATED",
        },
      ],
    });
    await prisma.session.create({
      data: { id: sessionId, token: `token-${sessionId}`, userId: deletedUserId, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.parentStudent.create({ data: { parentUserId, studentId: deletedProfileId } });
    await prisma.invite.create({
      data: {
        code: pendingCode,
        role: "PARENT",
        status: "PENDING",
        createdById: deletedUserId,
        createdByName: "삭제 학생",
        studentId: deletedProfileId,
      },
    });
    const rule = await prisma.meritRule.create({
      data: { track: "SCHOOL", kind: "MERIT", label: "졸업 보존 테스트", points: 1 },
    });
    meritRuleId = rule.id;
    const award = await prisma.meritAward.create({
      data: {
        studentProfileId: graduatedProfileId,
        year: GRADUATION_YEAR,
        ruleId: meritRuleId,
        track: "SCHOOL",
        kind: "MERIT",
        label: "졸업 보존 테스트",
        points: 1,
        occurredOn: new Date("2026-01-01T00:00:00+09:00"),
        awardedByUserId: adminId,
        awardedByName: "관리자",
      },
    });
    meritAwardId = award.id;
  });

  afterAll(async () => {
    await prisma.invite.deleteMany({ where: { code: pendingCode } });
    await prisma.meritAward.deleteMany({ where: { id: meritAwardId } });
    await prisma.meritRule.deleteMany({ where: { id: meritRuleId } });
    await prisma.user.deleteMany({ where: { id: { in: [deletedUserId, graduatedUserId, parentUserId, adminId] } } });
    await prisma.academicYear.deleteMany({
      where: { year: { in: [GRADUATION_YEAR, YEAR] } },
    });
  });

  it("삭제 학생은 cascade로 사라지고 GRADUATED 학생은 남는다", async () => {
    await applyRoster(YEAR, {
      // 졸업생은 새 학년도 명단에서 완전히 빠져 있다. 그래도 과거의 졸업
      // 학적과 연결 기록은 삭제 불변식이 지켜야 한다.
      assignments: [],
      newStudents: [],
      inviteExpiresAt: null,
      managedStudentProfileIds: [deletedProfileId, graduatedProfileId],
      // 방어선 검증: 잘못된 호출자가 졸업생 id까지 삭제 요청에 섞어도 repo가
      // 트랜잭션 안에서 다시 제외해야 한다.
      deleteStudentProfileIds: [deletedProfileId, graduatedProfileId],
      createdById: adminId,
      createdByName: "관리자",
    });

    expect(await prisma.user.findUnique({ where: { id: deletedUserId } })).toBeNull();
    expect(await prisma.studentProfile.findUnique({ where: { id: deletedProfileId } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull();
    expect(await prisma.parentStudent.findFirst({ where: { studentId: deletedProfileId } })).toBeNull();
    expect(await prisma.invite.findUnique({ where: { code: pendingCode } })).toBeNull();

    const graduated = await prisma.user.findUnique({
      where: { id: graduatedUserId },
      include: { studentProfile: { include: { enrollments: true } } },
    });
    expect(graduated?.status).toBe("INACTIVE");
    expect(graduated?.studentProfile?.enrollments).toEqual([
      expect.objectContaining({ year: GRADUATION_YEAR, status: "GRADUATED" }),
    ]);

    await expect(
      prisma.meritAward.findUnique({ where: { id: meritAwardId } }),
    ).resolves.toMatchObject({ studentProfileId: graduatedProfileId });
  });
});
