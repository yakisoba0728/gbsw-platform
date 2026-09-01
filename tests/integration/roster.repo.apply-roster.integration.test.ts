import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

/**
 * 실 Postgres(gbsw_test, 개발 DB와 분리)에 대고 applyRoster()의
 * "명단에서 빠짐 → 학생 영구 삭제" 경로를 검증한다.
 *
 * repo 단위 테스트(tests/modules/enrollment/roster.repo.test.ts)는 $transaction을
 * `(fn) => fn(tx)`로 흉내 낸다 — 실제 트랜잭션이 도는지, Cascade·세션 정리가
 * 의도한 범위로 도는지는 목으로는 검증되지 않는다.
 *
 * 이 파일이 만든 데이터만 정리한다(afterAll) — 전역 deleteMany()는 쓰지 않는다.
 */

const YEAR = 8102; // 실제 학년도와 절대 겹치지 않는, 이 테스트 전용 값.

describe("applyRoster() — 명단에서 빠진 학생은 DB에서 영구 삭제된다", () => {
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
        classId: null,
        number: null,
        status: "ENROLLED",
      },
    });

    // 영구 삭제 Cascade가 세션을 실제로 지우는지 보려면 지울 세션이 있어야 한다.
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

    // 삭제 대상 세 갈래 — 학생이 직접 만든 코드(createdById), 관리자가 이 학생
    // 몫으로 만든 코드(studentId), 이미 사용된 코드(usedById/studentId).
    // PENDING 두 건만 revokedInvites로 돌아오지만 DB 행은 셋 다 삭제된다.
    await prisma.invite.createMany({
      data: [
        {
          code: pendingByStudentCode,
          role: "PARENT",
          status: "PENDING",
          createdById: studentUserId,
          studentId: studentProfileId,
        },
        {
          code: pendingByAdminCode,
          role: "PARENT",
          status: "PENDING",
          createdById: adminId,
          studentId: studentProfileId,
        },
        {
          code: usedCode,
          role: "PARENT",
          status: "USED",
          createdById: adminId,
          studentId: studentProfileId,
          usedById: parentUserId,
          usedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    // 이미 삭제된 행은 noop이다. 테스트가 중간에 실패했을 때의 잔여물만 정리한다.
    await prisma.invite.deleteMany({
      where: { code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] } },
    });
    await prisma.parentStudent.deleteMany({ where: { id: parentStudentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [parentUserId, studentUserId, adminId] } },
    });
    await prisma.schoolClass.deleteMany({ where: { year: YEAR } });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("User/StudentProfile과 의존 행을 cascade로 지우고 학부모 계정은 보존한다", async () => {
    // 소진된 코드도 함께 지워지므로 함께 돌려받아야 한다 — 대기분만 모으면
    // 소진된 행이 감사로그 한 줄 없이 사라진다. 무엇이었는지는 status가 남긴다.
    const removedIds = (
      await prisma.invite.findMany({
        where: {
          code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] },
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
    });

    expect(result.revokedInvites.map((i) => i.id).sort()).toEqual(removedIds);
    expect(result.revokedInvites.every((i) => i.role === "PARENT")).toBe(true);
    expect(result.revokedInvites.map((i) => i.status).sort()).toEqual([
      "PENDING",
      "PENDING",
      "USED",
    ]);

    const remainingInvites = await prisma.invite.findMany({
      where: { code: { in: [pendingByStudentCode, pendingByAdminCode, usedCode] } },
      select: { id: true },
    });
    expect(remainingInvites).toEqual([]);

    const studentUser = await prisma.user.findUnique({ where: { id: studentUserId } });
    expect(studentUser).toBeNull();

    const profile = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    expect(profile).toBeNull();

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentProfileId_year: { studentProfileId, year: YEAR } },
    });
    expect(enrollment).toBeNull();

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session).toBeNull();

    const link = await prisma.parentStudent.findUnique({ where: { id: parentStudentId } });
    expect(link).toBeNull();

    const parentUser = await prisma.user.findUnique({ where: { id: parentUserId } });
    expect(parentUser?.status).toBe("ACTIVE");
  });
});
