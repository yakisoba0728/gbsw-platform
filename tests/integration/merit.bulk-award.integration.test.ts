import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";

const YEAR = 2026;
const made = { users: [] as string[], profiles: [] as string[], rules: [] as string[] };

async function makeStudent(suffix: string) {
  const user = await prisma.user.create({
    data: {
      id: `merit-test-u-${suffix}`,
      name: `통합테스트학생${suffix}`,
      email: `merit-test-${suffix}@example.invalid`,
      phone: "010-0000-0000",
      role: "STUDENT",
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      studentCode: `MTEST${suffix}`,
      birthDate: new Date("2009-03-02"),
    },
  });
  made.users.push(user.id);
  made.profiles.push(profile.id);
  return profile.id;
}

beforeAll(async () => {
  await prisma.academicYear.upsert({
    where: { year: YEAR },
    create: { year: YEAR },
    update: {},
  });
});

afterAll(async () => {
  await prisma.meritAward.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: made.profiles } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.meritRule.deleteMany({ where: { id: { in: made.rules } } });
});

describe("일괄 부여 트랜잭션", () => {
  it("한 건이라도 실패하면 아무것도 남지 않는다", async () => {
    const rule = await prisma.meritRule.create({
      data: { track: "DORM", kind: "DEMERIT", label: "점호 지각", points: 3 },
    });
    made.rules.push(rule.id);

    const a = await makeStudent("a");
    const b = await makeStudent("b");

    const base = {
      year: YEAR,
      ruleId: rule.id,
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각",
      points: 3,
      note: null,
      awardedByUserId: null,
      awardedByName: "통합테스트",
      batchId: "batch-rollback",
    };

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.meritAward.create({ data: { ...base, studentProfileId: a } });
        await tx.meritAward.create({ data: { ...base, studentProfileId: b } });
        // 없는 학생 — 외래키 위반으로 트랜잭션 전체가 되감긴다.
        await tx.meritAward.create({
          data: { ...base, studentProfileId: "존재하지-않는-학생" },
        });
      }),
    ).rejects.toThrow();

    const left = await prisma.meritAward.count({
      where: { batchId: "batch-rollback" },
    });
    expect(left).toBe(0);
  });

  it("성공하면 전부 같은 batchId로 남는다", async () => {
    const rule = await prisma.meritRule.create({
      data: { track: "DORM", kind: "DEMERIT", label: "점호 지각 2", points: 3 },
    });
    made.rules.push(rule.id);

    const a = await makeStudent("c");
    const b = await makeStudent("d");

    const base = {
      year: YEAR,
      ruleId: rule.id,
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각 2",
      points: 3,
      note: null,
      awardedByUserId: null,
      awardedByName: "통합테스트",
      batchId: "batch-ok",
    };

    await prisma.$transaction(async (tx) => {
      await tx.meritAward.create({ data: { ...base, studentProfileId: a } });
      await tx.meritAward.create({ data: { ...base, studentProfileId: b } });
    });

    const rows = await prisma.meritAward.findMany({ where: { batchId: "batch-ok" } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);
  });

  it("기숙사 합계는 학년도를 넘어 누적된다", async () => {
    const rule = await prisma.meritRule.create({
      data: { track: "DORM", kind: "MERIT", label: "생활 우수", points: 4 },
    });
    made.rules.push(rule.id);

    await prisma.academicYear.upsert({
      where: { year: YEAR - 1 },
      create: { year: YEAR - 1 },
      update: {},
    });

    const student = await makeStudent("e");
    const base = {
      studentProfileId: student,
      ruleId: rule.id,
      track: "DORM",
      kind: "MERIT",
      label: "생활 우수",
      points: 4,
      note: null,
      awardedByUserId: null,
      awardedByName: "통합테스트",
      batchId: null,
    };

    await prisma.meritAward.create({ data: { ...base, year: YEAR } });
    await prisma.meritAward.create({ data: { ...base, year: YEAR - 1 } });

    const cumulative = await prisma.meritAward.aggregate({
      where: { studentProfileId: student, track: "DORM", status: "ACTIVE" },
      _sum: { points: true },
    });
    const thisYearOnly = await prisma.meritAward.aggregate({
      where: {
        studentProfileId: student,
        track: "DORM",
        status: "ACTIVE",
        year: YEAR,
      },
      _sum: { points: true },
    });

    expect(cumulative._sum.points).toBe(8);
    expect(thisYearOnly._sum.points).toBe(4);
  });
});
