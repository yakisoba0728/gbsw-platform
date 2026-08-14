import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

/**
 * I7 — 실 Postgres(gbsw_test, 개발 DB와 분리)에 대고 applyRoster()의 삭제
 * 경로를 검증한다.
 *
 * repo 테스트(tests/modules/enrollment/roster.repo.test.ts)는 $transaction을
 * `(fn) => fn(tx)`로 흉내 내 왔다 — 실제 트랜잭션이 도는지, Cascade 범위가
 * 의도한 대로인지(학부모 계정은 삭제 대상이 아닌데도 살아남는가)는 목으로는
 * 검증되지 않았다.
 *
 * 이 파일이 만든 데이터만 정리한다(afterAll) — 전역 deleteMany()는 쓰지 않는다.
 */

const YEAR = 8101; // 실제 학년도와 절대 겹치지 않는, 이 테스트 전용 값.

describe("applyRoster() — 명단에서 빠진 학생 삭제 (I7)", () => {
  const adminId = randomUUID();
  const studentUserId = randomUUID();
  const parentUserId = randomUUID();
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
        studentCode: `ITST${randomUUID().slice(0, 4).toUpperCase()}`,
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
  });

  afterAll(async () => {
    // applyRoster가 이미 studentUserId·studentProfileId·parentStudentId를
    // 지웠을 것이다(성공 경로) — deleteMany는 없는 행을 지우려 해도 조용히
    // 0건으로 끝나므로 실패 여부와 무관하게 안전하게 정리된다.
    await prisma.parentStudent.deleteMany({ where: { id: parentStudentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [parentUserId, studentUserId, adminId] } },
    });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("학생을 지우면 계정·프로필·소속이 사라지고, 연결된 학부모 계정은 남는다", async () => {
    await applyRoster(YEAR, {
      assignments: [],
      newStudents: [],
      inviteExpiresAt: null,
      managedStudentProfileIds: [studentProfileId],
      deleteStudentProfileIds: [studentProfileId],
      createdById: adminId,
    });

    const studentUser = await prisma.user.findUnique({
      where: { id: studentUserId },
    });
    expect(studentUser).toBeNull();

    const profile = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    expect(profile).toBeNull();

    const link = await prisma.parentStudent.findUnique({
      where: { id: parentStudentId },
    });
    expect(link).toBeNull();

    // 학부모 계정 자체는 살아 있어야 한다 — 관리자가 요청한 것은 학생 삭제이지
    // 학부모 삭제가 아니다.
    const parentUser = await prisma.user.findUnique({ where: { id: parentUserId } });
    expect(parentUser).not.toBeNull();
    expect(parentUser?.status).toBe("ACTIVE");
  });
});
