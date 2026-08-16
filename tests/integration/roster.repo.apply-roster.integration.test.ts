import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { applyRoster } from "@/modules/enrollment/roster.repo";

/**
 * I7 → 2026-08-14 소프트 삭제 결정 — 실 Postgres(gbsw_test, 개발 DB와 분리)에 대고
 * applyRoster()의 "명단에서 빠짐 → 다시 나타남" 전체 왕복을 검증한다.
 *
 * 예전(하드 삭제 시절)엔 이 파일이 "지우면 계정이 사라지는지"만 봤다. 이제는
 * 지우지 않고 표시만 하므로, 진짜 확인해야 할 것은 **되돌아오는지**다 —
 * "다시 넣으면 돌아온다"가 이번 변경 전체의 존재 이유다(design.md).
 *
 * repo 단위 테스트(tests/modules/enrollment/roster.repo.test.ts)는 $transaction을
 * `(fn) => fn(tx)`로 흉내 낸다 — 실제 트랜잭션이 도는지, Cascade·세션 정리가
 * 의도한 범위로만 도는지(학부모 연결은 안 끊기는가)는 목으로는 검증되지 않는다.
 *
 * 이 파일이 만든 데이터만 정리한다(afterAll) — 전역 deleteMany()는 쓰지 않는다.
 */

const YEAR = 8102; // 실제 학년도와 절대 겹치지 않는, 이 테스트 전용 값.

describe("applyRoster() — 명단에서 빠지면 소프트 삭제되고, 다시 넣으면 되살아난다", () => {
  const adminId = randomUUID();
  const studentUserId = randomUUID();
  const parentUserId = randomUUID();
  const sessionId = randomUUID();
  const studentCode = `ITST${randomUUID().slice(0, 4).toUpperCase()}`;
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

    // 소프트 삭제가 세션을 실제로 지우는지 보려면 지울 세션이 있어야 한다.
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
  });

  afterAll(async () => {
    await prisma.parentStudent.deleteMany({ where: { id: parentStudentId } });
    await prisma.user.deleteMany({
      where: { id: { in: [parentUserId, studentUserId, adminId] } },
    });
    // 되살아나는 두 번째 테스트가 SchoolClass(1학년 1반, YEAR)를 upsert로 만든다 —
    // SchoolClass.year가 AcademicYear를 Restrict로 참조하므로 먼저 지워야 한다.
    await prisma.schoolClass.deleteMany({ where: { year: YEAR } });
    await prisma.academicYear.deleteMany({ where: { year: YEAR } });
  });

  it("명단에서 빼면 계정은 살아 있고 deletedAt만 찍힌다 — 세션은 끊기고, " +
    "학부모 연결은 계정이 안 지워지므로 함께 끊기지 않는다", async () => {
    await applyRoster(YEAR, {
      assignments: [],
      newStudents: [],
      inviteExpiresAt: null,
      managedStudentProfileIds: [studentProfileId],
      deleteStudentProfileIds: [studentProfileId],
      createdById: adminId,
    });

    const studentUser = await prisma.user.findUnique({ where: { id: studentUserId } });
    expect(studentUser).not.toBeNull();
    expect(studentUser?.deletedAt).not.toBeNull();
    expect(studentUser?.status).toBe("INACTIVE");

    const profile = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
    });
    expect(profile).not.toBeNull();

    // 그 학년도 배정은 없어진다 — managedStudentProfileIds 범위로 지우고, 명단에
    // 없으니 새로 만들지 않는다. **부작용이 아니라 결정이다**(2026-08-16): 명단에서
    // 줄을 지웠다는 건 "이 학년도에 애초에 있으면 안 될 사람"이라는 뜻이라 그
    // 학년도 배정이 없어지는 게 맞다. 자퇴·전출처럼 "있었다가 나갔다"를 남기려면
    // 줄을 지우는 게 아니라 학적 칸(재학·졸업·자퇴·퇴학·전출·유예)을 바꿔야 하고,
    // 그 경로는 배정을 지우지 않는다.
    // StudentProfile·과거 학년도 기록·상벌점은 손대지 않는다.
    const enrollment = await prisma.enrollment.findUnique({
      where: { studentProfileId_year: { studentProfileId, year: YEAR } },
    });
    expect(enrollment).toBeNull();

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session).toBeNull();

    // 연결된 학부모 계정과 ParentStudent 연결은 그대로다 — 계정 자체가 안
    // 지워지므로 끊길 이유가 없다(하드 삭제 시절엔 Cascade로 끊겼었다).
    const link = await prisma.parentStudent.findUnique({ where: { id: parentStudentId } });
    expect(link).not.toBeNull();
    const parentUser = await prisma.user.findUnique({ where: { id: parentUserId } });
    expect(parentUser?.status).toBe("ACTIVE");
  });

  it("다시 명단에 넣으면(같은 studentCode로 배정을 받으면) deletedAt이 지워지고 " +
    "계정이 되살아난다 — 이게 이번 변경 전체의 존재 이유다", async () => {
    await applyRoster(YEAR, {
      assignments: [
        {
          line: 2,
          studentCode,
          name: "통합테스트 학생",
          birthDate: "2010-01-01",
          grade: 1,
          classNo: 1,
          number: 1,
          status: "ENROLLED",
          errors: [],
          studentProfileId,
          beforeName: "통합테스트 학생",
          statusChanged: true,
        },
      ],
      newStudents: [],
      inviteExpiresAt: null,
      managedStudentProfileIds: [studentProfileId],
      deleteStudentProfileIds: [],
      createdById: adminId,
    });

    const studentUser = await prisma.user.findUnique({ where: { id: studentUserId } });
    expect(studentUser?.deletedAt).toBeNull();
    expect(studentUser?.status).toBe("ACTIVE");

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentProfileId_year: { studentProfileId, year: YEAR } },
    });
    expect(enrollment?.status).toBe("ENROLLED");
    expect(enrollment?.number).toBe(1);

    // 학부모 연결은 삭제·복구 왕복 내내 한 번도 끊긴 적이 없다.
    const link = await prisma.parentStudent.findUnique({ where: { id: parentStudentId } });
    expect(link).not.toBeNull();
  });
});
