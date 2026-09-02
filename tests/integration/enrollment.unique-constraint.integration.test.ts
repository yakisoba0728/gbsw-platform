import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";

/**
 * I7 — Enrollment(year, grade, classNo, number) 유일 제약이 실제로 걸리는지, 그리고
 * isUniqueViolation()이 실물 P2002를 "number" 위반으로 정확히 잡아내는지
 * 검증한다.
 *
 * admin-user.repo.test.ts·enrollment.repo.test.ts의 realWorldNumberP2002()
 * 픽스처는 "Prisma 7.9 + @prisma/adapter-pg에서 관측한 오류 모양을 손으로
 * 흉내 낸 것"이다 — 이 테스트는 그 픽스처가 실물과 정말 같은 모양인지를
 * 실 Postgres로 검증하는 역할도 겸한다.
 */

const YEAR = 8103;
const OTHER_YEAR = 8104;

describe("Enrollment(year, grade, classNo, number) 유일 제약 (I7)", () => {
  const studentAId = randomUUID();
  const studentBId = randomUUID();
  const studentCId = randomUUID();
  let profileAId: string;
  let profileBId: string;
  let profileCId: string;

  beforeAll(async () => {
    await prisma.academicYear.createMany({
      data: [{ year: YEAR }, { year: OTHER_YEAR }],
    });

    await prisma.user.create({
      data: {
        id: studentAId,
        name: "통합테스트 학생A",
        email: `itest-uniq-a-${studentAId}@example.invalid`,
        phone: "010-0000-3001",
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    await prisma.user.create({
      data: {
        id: studentCId,
        name: "통합테스트 학생C",
        email: `itest-uniq-c-${studentCId}@example.invalid`,
        phone: "010-0000-3003",
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    await prisma.user.create({
      data: {
        id: studentBId,
        name: "통합테스트 학생B",
        email: `itest-uniq-b-${studentBId}@example.invalid`,
        phone: "010-0000-3002",
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    const profileA = await prisma.studentProfile.create({
      data: {
        userId: studentAId,
        studentCode: `ITSA${randomUUID().slice(0, 4).toUpperCase()}`,
        birthDate: new Date("2010-01-01T00:00:00+09:00"),
      },
    });
    profileAId = profileA.id;

    const profileB = await prisma.studentProfile.create({
      data: {
        userId: studentBId,
        studentCode: `ITSB${randomUUID().slice(0, 4).toUpperCase()}`,
        birthDate: new Date("2010-01-02T00:00:00+09:00"),
      },
    });
    profileBId = profileB.id;

    const profileC = await prisma.studentProfile.create({
      data: {
        userId: studentCId,
        studentCode: `ITSC${randomUUID().slice(0, 4).toUpperCase()}`,
        birthDate: new Date("2010-01-03T00:00:00+09:00"),
      },
    });
    profileCId = profileC.id;
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { year: { in: [YEAR, OTHER_YEAR] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [studentAId, studentBId, studentCId] } },
    });
    await prisma.academicYear.deleteMany({ where: { year: { in: [YEAR, OTHER_YEAR] } } });
  });

  beforeEach(async () => {
    await prisma.enrollment.deleteMany({
      where: { studentProfileId: { in: [profileAId, profileBId, profileCId] } },
    });
  });

  it("같은 반·번호로 두 번째 Enrollment를 만들면 P2002가 나고 isUniqueViolation이 number로 잡아낸다", async () => {
    await prisma.enrollment.create({
      data: {
        studentProfileId: profileAId,
        year: YEAR,
        grade: 1,
        classNo: 1,
        number: 1,
        status: "ENROLLED",
      },
    });

    let caught: unknown;
    try {
      await prisma.enrollment.create({
        data: {
          studentProfileId: profileBId,
          year: YEAR,
          grade: 1,
          classNo: 1,
          number: 1,
          status: "ENROLLED",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("P2002");
    expect(isUniqueViolation(caught, "number")).toBe(true);
    // 관계없는 필드로는 잡히지 않는다 — 실물 오류 모양을 제대로 파싱하는지의 대조군.
    expect(isUniqueViolation(caught, "email")).toBe(false);
  });

  it("학년도가 다르면 같은 학년·반·번호를 허용한다", async () => {
    await prisma.enrollment.create({
      data: {
        studentProfileId: profileAId,
        year: YEAR,
        grade: 1,
        classNo: 1,
        number: 1,
        status: "ENROLLED",
      },
    });

    await expect(
      prisma.enrollment.create({
        data: {
          studentProfileId: profileBId,
          year: OTHER_YEAR,
          grade: 1,
          classNo: 1,
          number: 1,
          status: "ENROLLED",
        },
      }),
    ).resolves.toMatchObject({ year: OTHER_YEAR, grade: 1, classNo: 1, number: 1 });
  });

  it("좌석 필드가 null인 비재학 행끼리는 충돌하지 않는다", async () => {
    await expect(
      prisma.enrollment.createMany({
        data: [
          {
            studentProfileId: profileBId,
            year: YEAR,
            grade: null,
            classNo: null,
            number: null,
            status: "GRADUATED",
          },
          {
            studentProfileId: profileCId,
            year: YEAR,
            grade: null,
            classNo: null,
            number: null,
            status: "WITHDRAWN",
          },
        ],
      }),
    ).resolves.toMatchObject({ count: 2 });
  });
});
