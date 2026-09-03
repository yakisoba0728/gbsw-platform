import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { planRoster } from "@/modules/enrollment/roster.plan";
import { applyRoster, listExisting } from "@/modules/enrollment/roster.repo";

const YEAR = 8102;
const GRADUATION_YEAR = YEAR - 1;

describe("applyRoster() — 학생 명단 제외와 졸업 보존", () => {
  const adminId = randomUUID();
  const deletedUserId = randomUUID();
  const graduatedUserId = randomUUID();
  const parentUserId = randomUUID();
  const sessionId = randomUUID();
  const pendingCode = `ITPD${randomUUID().slice(0, 8).toUpperCase()}`;
  const deletedStudentCode = `ITD${randomUUID().slice(0, 5).toUpperCase()}`;
  let meritRuleId = "";
  let removedMeritAwardId = "";
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
        data: { userId: deletedUserId, studentCode: deletedStudentCode, birthDate: new Date("2010-01-01T00:00:00+09:00") },
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
    const removedAward = await prisma.meritAward.create({
      data: {
        studentProfileId: deletedProfileId,
        year: YEAR,
        ruleId: meritRuleId,
        track: "SCHOOL",
        kind: "MERIT",
        label: "명단 제외 보존 테스트",
        points: 1,
        occurredOn: new Date("2026-08-01T00:00:00+09:00"),
        awardedByUserId: adminId,
        awardedByName: "관리자",
      },
    });
    removedMeritAwardId = removedAward.id;
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
    await prisma.meritAward.deleteMany({
      where: { id: { in: [removedMeritAwardId, meritAwardId] } },
    });
    await prisma.meritRule.deleteMany({ where: { id: meritRuleId } });
    await prisma.user.deleteMany({ where: { id: { in: [deletedUserId, graduatedUserId, parentUserId, adminId] } } });
    await prisma.academicYear.deleteMany({
      where: { year: { in: [GRADUATION_YEAR, YEAR] } },
    });
  });

  it("제외 학생의 계정·연결은 보존하고 GRADUATED 학생도 그대로 둔다", async () => {
    await applyRoster(YEAR, {
      assignments: [],
      managedStudentProfileIds: [deletedProfileId, graduatedProfileId],
      deleteStudentProfileIds: [deletedProfileId, graduatedProfileId],
    });

    const removedUser = await prisma.user.findUnique({ where: { id: deletedUserId } });
    expect(removedUser).toMatchObject({ status: "INACTIVE" });
    expect(removedUser?.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.studentProfile.findUnique({ where: { id: deletedProfileId } })).not.toBeNull();
    expect(await prisma.session.findUnique({ where: { id: sessionId } })).toBeNull();
    expect(await prisma.parentStudent.findFirst({ where: { studentId: deletedProfileId } })).not.toBeNull();
    expect(await prisma.meritAward.findUnique({ where: { id: removedMeritAwardId } })).toMatchObject({
      studentProfileId: deletedProfileId,
    });
    expect(await prisma.invite.findUnique({ where: { code: pendingCode } })).toMatchObject({
      status: "REVOKED",
    });

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

    const existing = await listExisting(YEAR);
    const plan = planRoster(
      [
        {
          line: 2,
          studentCode: deletedStudentCode,
          name: "삭제 학생",
          birthDate: "2010-01-01",
          grade: 1,
          classNo: 2,
          number: 3,
          status: "ENROLLED",
          errors: [],
        },
      ],
      existing,
    );
    expect(plan.newAssignment).toEqual([
      expect.objectContaining({ studentProfileId: deletedProfileId }),
    ]);

    await applyRoster(YEAR, {
      assignments: plan.newAssignment.map((row) => ({
        ...row,
        statusChanged: true,
      })),
      managedStudentProfileIds: existing.map((student) => student.studentProfileId),
      deleteStudentProfileIds: [],
    });

    const restored = await prisma.user.findUnique({
      where: { id: deletedUserId },
      include: { studentProfile: { include: { enrollments: true } } },
    });
    expect(restored).toMatchObject({ status: "ACTIVE", deletedAt: null });
    expect(restored?.studentProfile?.id).toBe(deletedProfileId);
    expect(restored?.studentProfile?.enrollments).toEqual([
      expect.objectContaining({ year: YEAR, status: "ENROLLED" }),
    ]);
    expect(await prisma.parentStudent.findFirst({ where: { studentId: deletedProfileId } })).not.toBeNull();
    expect(await prisma.meritAward.findUnique({ where: { id: removedMeritAwardId } })).not.toBeNull();
  });
});
