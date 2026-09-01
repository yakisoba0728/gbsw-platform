import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { prisma } from "@/core/db/client";

/**
 * 상벌점 통합 테스트 — 실 Postgres(gbsw_test)에 대고 돈다.
 *
 * **repo·서비스를 실제로 부른다.** 예전 버전은 이 파일 안에서 prisma.$transaction을
 * 직접 짜서 확인했는데, 그러면 repo.createAwards를 createMany로 바꾸거나 아예 지워도
 * 테스트가 통과했다 — Prisma가 트랜잭션을 지원한다는 사실만 확인하고 우리 코드는
 * 하나도 안 건드리는 테스트였다.
 *
 * 감사로그는 목으로 막는다. recordAudit이 요청 컨텍스트(headers)를 읽는데
 * 테스트에는 요청이 없고, 여기서 확인하려는 것은 감사가 아니라 트랜잭션과
 * 집계 범위다.
 */
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));

const repo = await import("@/modules/merit/merit.repo");
const service = await import("@/modules/merit/award.service");

const YEAR = 2026;
const PAST = YEAR - 1;

// 발생일은 그 학년도(3월~이듬해 2월) 안이어야 한다 — 서비스가 검사한다.
// 기준 시각도 함께 고정한다 (오늘 날짜에 따라 흔들리지 않게).
const OCCURRED_ON = new Date("2026-06-12T00:00:00+09:00");
const NOW = new Date("2026-08-16T10:00:00+09:00");

const made = {
  users: [] as string[],
  profiles: [] as string[],
  rules: [] as string[],
  years: [] as number[],
};

const admin = {
  id: "merit-test-admin",
  name: "통합테스트관리자",
  email: "merit-test-admin@example.invalid",
  role: "ADMIN" as const,
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

/**
 * 통합 테스트용 학생. **그 학년도 재적(ENROLLED) 줄을 함께 만든다** — 부여
 * 게이트(`findAwardableStudent`)와 기준 초과 명단이 그것을 술어로 쓴다.
 * 반은 붙이지 않는다: 반 미배정도 재적이고, 그 학생에게도 부여할 수 있어야 한다.
 */
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
  await prisma.enrollment.create({
    data: {
      studentProfileId: profile.id,
      year: YEAR,
      classId: null,
      number: null,
      status: "ENROLLED",
    },
  });
  made.users.push(user.id);
  made.profiles.push(profile.id);
  return profile.id;
}

async function makeRule(overrides: {
  track: string;
  kind: string;
  label: string;
  points: number;
}) {
  const rule = await prisma.meritRule.create({ data: overrides });
  made.rules.push(rule.id);
  return rule.id;
}

async function makeYearRaceYears() {
  const fromYear = 8114;
  const toYear = 8115;
  await prisma.academicYear.createMany({
    data: [
      { year: fromYear, isCurrent: false },
      { year: toYear, isCurrent: false },
    ],
    skipDuplicates: true,
  });
  made.years.push(fromYear, toYear);
  await prisma.academicYear.updateMany({ data: { isCurrent: false } });
  await prisma.academicYear.update({
    where: { year: fromYear },
    data: { isCurrent: true },
  });
  return { fromYear, toYear };
}

async function afterConcurrentRuleSoftDelete<T>(
  ruleId: string,
  run: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    await client.query('UPDATE "MeritRule" SET "active" = false WHERE "id" = $1', [
      ruleId,
    ]);

    const result = run().then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason) => ({ status: "rejected", reason }) as const,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.query("COMMIT");
    committed = true;
    return result;
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

async function afterConcurrentYearSwitch<T>(
  toYear: number,
  run: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    await client.query('SELECT "year" FROM "AcademicYear" ORDER BY "year" FOR UPDATE');
    await client.query('UPDATE "AcademicYear" SET "isCurrent" = false WHERE "isCurrent"');
    await client.query('UPDATE "AcademicYear" SET "isCurrent" = true WHERE "year" = $1', [
      toYear,
    ]);

    const result = run().then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason) => ({ status: "rejected", reason }) as const,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await client.query("COMMIT");
    committed = true;
    return result;
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
    await prisma.academicYear.updateMany({ data: { isCurrent: false } });
    await prisma.academicYear.update({
      where: { year: YEAR },
      data: { isCurrent: true },
    });
  }
}

beforeAll(async () => {
  // 부여자·취소자는 실제 User 행을 가리켜야 한다 (외래키). 목으로 대체할 수 없는
  // 부분이라 통합 테스트에서만 만들고 afterAll에서 지운다.
  await prisma.user.upsert({
    where: { id: admin.id },
    create: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: "010-0000-0000",
      role: "ADMIN",
    },
    update: {},
  });
  made.users.push(admin.id);

  for (const year of [PAST, YEAR]) {
    await prisma.academicYear.upsert({
      where: { year },
      create: { year },
      update: {},
    });
  }
  // 서비스가 getCurrentYear()로 부여 학년도를 정한다. 시드 행이 이미
  // isCurrent를 들고 있으므로 값만 확인하고 건드리지 않는다.
  const current = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (current?.year !== YEAR) {
    await prisma.academicYear.updateMany({ data: { isCurrent: false } });
    await prisma.academicYear.update({
      where: { year: YEAR },
      data: { isCurrent: true },
    });
  }
});

afterAll(async () => {
  await prisma.meritAward.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.enrollment.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: made.profiles } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.meritRule.deleteMany({ where: { id: { in: made.rules } } });
  await prisma.academicYear.deleteMany({ where: { year: { in: made.years } } });
});

describe("repo.createAwards — 일괄 부여 트랜잭션", () => {
  it("한 건이라도 실패하면 아무것도 남지 않는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각",
      points: 3,
    });
    const a = await makeStudent("a");
    const b = await makeStudent("b");

    const base = {
      year: YEAR,
      ruleId,
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각",
      points: 3,
      occurredOn: OCCURRED_ON,
      note: null,
      awardedByUserId: admin.id,
      awardedByName: "통합테스트",
    };

    await expect(
      repo.createAwards([
        { ...base, studentProfileId: a },
        { ...base, studentProfileId: b },
        // 없는 학생 — 외래키 위반으로 트랜잭션 전체가 되감긴다.
        { ...base, studentProfileId: "존재하지-않는-학생" },
      ]),
    ).rejects.toThrow();

    const left = await prisma.meritAward.count({
      where: { ruleId },
    });
    expect(left).toBe(0);
  });

  /**
   * 최근 부여 화면은 `batchId` 열이 없어 **입력 시각으로 「한 번의 부여」를 알아낸다**
   * (`src/app/(app)/merit/recent/page.tsx`). 목으로는 못 잡는다 — Prisma가
   * `@default(now())`를 create마다 다시 찍는 것이 문제였고, 그건 실제 클라이언트가
   * 돌아야 드러난다. 갈리면 오류 없이 화면만 흩어진다.
   */
  it("한 번의 부여는 밀리초까지 같은 createdAt을 갖는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "MERIT",
      label: "한 시각 검증",
      points: 1,
    });
    const base = {
      year: YEAR,
      ruleId,
      track: "DORM",
      kind: "MERIT",
      label: "한 시각 검증",
      points: 1,
      occurredOn: OCCURRED_ON,
      note: null,
      awardedByUserId: admin.id,
      awardedByName: "통합테스트",
    };

    await repo.createAwards([
      { ...base, studentProfileId: await makeStudent("stamp-a") },
      { ...base, studentProfileId: await makeStudent("stamp-b") },
      { ...base, studentProfileId: await makeStudent("stamp-c") },
    ]);

    const rows = await prisma.meritAward.findMany({
      where: { ruleId },
      select: { createdAt: true },
    });

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.createdAt.getTime())).size).toBe(1);
  });
});

describe("service.bulkAwardMerit — 실제 경로", () => {
  it("단건 부여는 동시에 삭제 완료된 규정으로 커밋하지 않는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "DEMERIT",
      label: "삭제 경합 단건",
      points: 3,
    });
    const student = await makeStudent(`race-single-${randomUUID().slice(0, 6)}`);

    const result = await afterConcurrentRuleSoftDelete(ruleId, () =>
      service.awardMerit(admin, { studentProfileId: student, ruleId, note: null }, NOW),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatchObject({ message: "RULE_INACTIVE" });
    expect(await prisma.meritAward.count({ where: { ruleId } })).toBe(0);
  });

  it("일괄 부여도 동시에 삭제 완료된 규정으로 커밋하지 않는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "DEMERIT",
      label: "삭제 경합 일괄",
      points: 3,
    });
    const a = await makeStudent(`race-bulk-a-${randomUUID().slice(0, 6)}`);
    const b = await makeStudent(`race-bulk-b-${randomUUID().slice(0, 6)}`);

    const result = await afterConcurrentRuleSoftDelete(ruleId, () =>
      service.bulkAwardMerit(admin, { studentProfileIds: [a, b], ruleId, note: null }, NOW),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toMatchObject({ message: "RULE_INACTIVE" });
    expect(await prisma.meritAward.count({ where: { ruleId } })).toBe(0);
  });

  it("단건 부여는 동시에 전환 완료된 이전 학년도로 커밋하지 않는다", async () => {
    const { fromYear, toYear } = await makeYearRaceYears();
    const ruleId = await makeRule({
      track: "SCHOOL",
      kind: "MERIT",
      label: "학년도 경합 단건",
      points: 3,
    });
    const student = await makeStudent(`year-single-${randomUUID().slice(0, 6)}`);
    const now = new Date(`${fromYear}-08-16T10:00:00+09:00`);

    const result = await afterConcurrentYearSwitch(toYear, () =>
      service.awardMerit(admin, { studentProfileId: student, ruleId, note: null }, now),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ message: "OCCURRED_OUT_OF_YEAR" });
    }
    expect(await prisma.meritAward.count({ where: { ruleId, year: fromYear } })).toBe(0);
  });

  it("일괄 부여도 동시에 전환 완료된 이전 학년도로 커밋하지 않는다", async () => {
    const { fromYear, toYear } = await makeYearRaceYears();
    const ruleId = await makeRule({
      track: "SCHOOL",
      kind: "MERIT",
      label: "학년도 경합 일괄",
      points: 3,
    });
    const a = await makeStudent(`year-bulk-a-${randomUUID().slice(0, 6)}`);
    const b = await makeStudent(`year-bulk-b-${randomUUID().slice(0, 6)}`);
    const now = new Date(`${fromYear}-08-16T10:00:00+09:00`);

    const result = await afterConcurrentYearSwitch(toYear, () =>
      service.bulkAwardMerit(admin, { studentProfileIds: [a, b], ruleId, note: null }, now),
    );

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ message: "OCCURRED_OUT_OF_YEAR" });
    }
    expect(await prisma.meritAward.count({ where: { ruleId, year: fromYear } })).toBe(0);
  });

  it("전원에게 들어가되 기록끼리 묶이지 않는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각 2",
      points: 3,
    });
    const a = await makeStudent("c");
    const b = await makeStudent("d");

    const result = await service.bulkAwardMerit(
      admin,
      { studentProfileIds: [a, b], ruleId, note: null },
      NOW,
    );
    expect(result).toEqual({ count: 2 });

    const rows = await prisma.meritAward.findMany({
      where: { studentProfileId: { in: [a, b] } },
    });
    expect(rows).toHaveLength(2);

    // 규정 값이 스냅샷됐고, 학년도는 현재 학년도다 (입력으로 받지 않는다).
    expect(rows[0].label).toBe("점호 지각 2");
    expect(rows[0].points).toBe(3);
    expect(rows[0].year).toBe(YEAR);
  });

  it("한 명이라도 없는 학생이면 아무것도 안 남는다", async () => {
    const ruleId = await makeRule({
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각 3",
      points: 3,
    });
    const a = await makeStudent("e");

    await expect(
      service.bulkAwardMerit(
        admin,
        {
          studentProfileIds: [a, "존재하지-않는-학생"],
          ruleId,
          note: null,
        },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(await prisma.meritAward.count({ where: { ruleId } })).toBe(0);
  });
});

describe("합계 범위 — 교내는 학년도별, 기숙사는 누적", () => {
  it("service.getStudentMerit이 트랙에 따라 다른 합계를 낸다", async () => {
    const dormRule = await makeRule({
      track: "DORM",
      kind: "MERIT",
      label: "생활 우수",
      points: 4,
    });
    const schoolRule = await makeRule({
      track: "SCHOOL",
      kind: "MERIT",
      label: "봉사 우수",
      points: 6,
    });
    const student = await makeStudent("f");

    // 두 학년도에 걸쳐 같은 트랙으로 한 건씩 넣는다.
    for (const [ruleId, track, label, points] of [
      [dormRule, "DORM", "생활 우수", 4],
      [schoolRule, "SCHOOL", "봉사 우수", 6],
    ] as const) {
      for (const year of [PAST, YEAR]) {
        await prisma.meritAward.create({
          data: {
            studentProfileId: student,
            year,
            ruleId,
            track,
            kind: "MERIT",
            label,
            points,
            occurredOn: OCCURRED_ON,
            note: null,
            awardedByUserId: admin.id,
            awardedByName: "통합테스트",
          },
        });
      }
    }

    // 기숙사: 학년도 조건 없이 두 해가 다 더해진다.
    const dorm = await service.getStudentMerit(admin, student, "DORM");
    expect(dorm.year).toBeNull();
    expect(dorm.totals.merit).toBe(8);
    expect(dorm.awards).toHaveLength(2);

    // 교내: 현재 학년도만.
    const school = await service.getStudentMerit(admin, student, "SCHOOL");
    expect(school.year).toBe(YEAR);
    expect(school.totals.merit).toBe(6);
    expect(school.awards).toHaveLength(1);

    // 교내 + 지난 학년도 명시.
    const past = await service.getStudentMerit(admin, student, "SCHOOL", PAST);
    expect(past.year).toBe(PAST);
    expect(past.totals.merit).toBe(6);
  });

  it("취소된 기록은 합계에서 빠지되 내역에는 남는다", async () => {
    const ruleId = await makeRule({
      track: "SCHOOL",
      kind: "DEMERIT",
      label: "복장 불량",
      points: 3,
    });
    const student = await makeStudent("g");

    const award = await prisma.meritAward.create({
      data: {
        studentProfileId: student,
        year: YEAR,
        ruleId,
        track: "SCHOOL",
        kind: "DEMERIT",
        label: "복장 불량",
        points: 3,
        occurredOn: OCCURRED_ON,
        note: null,
        awardedByUserId: admin.id,
        awardedByName: "통합테스트",
      },
    });

    const before = await service.getStudentMerit(admin, student, "SCHOOL");
    expect(before.totals.demerit).toBe(3);

    await service.cancelAward(admin, { awardId: award.id, reason: "오기입" });

    const after = await service.getStudentMerit(admin, student, "SCHOOL");
    expect(after.totals.demerit).toBe(0);
    expect(after.awards).toHaveLength(1);
    expect(after.awards[0].status).toBe("CANCELLED");
    expect(after.awards[0].cancelReason).toBe("오기입");
  });

  it("두 번째 취소는 0행이 되어 거부된다 (동시 취소 방어)", async () => {
    const ruleId = await makeRule({
      track: "SCHOOL",
      kind: "DEMERIT",
      label: "지각",
      points: 1,
    });
    const student = await makeStudent("h");

    const award = await prisma.meritAward.create({
      data: {
        studentProfileId: student,
        year: YEAR,
        ruleId,
        track: "SCHOOL",
        kind: "DEMERIT",
        label: "지각",
        points: 1,
        occurredOn: OCCURRED_ON,
        note: null,
        awardedByUserId: admin.id,
        awardedByName: "통합테스트",
      },
    });

    // repo를 직접 두 번 불러 "사전 검사를 통과한 두 요청"을 흉내 낸다.
    expect(
      await repo.cancelAward(award.id, {
        userId: admin.id,
        name: admin.name,
        reason: "첫 번째",
      }),
    ).toBe(1);
    expect(
      await repo.cancelAward(award.id, {
        userId: admin.id,
        name: "다른 사람",
        reason: "두 번째",
      }),
    ).toBe(0);

    // 먼저 쓴 사람의 흔적이 덮이지 않았다.
    const row = await prisma.meritAward.findUnique({ where: { id: award.id } });
    expect(row?.cancelReason).toBe("첫 번째");
    expect(row?.cancelledByName).toBe(admin.name);
  });
});

/**
 * 기준 초과 명단의 SQL 쪽 조건 — 목으로는 확인할 수 없는 부분이다.
 *
 * 서비스 테스트는 repo가 돌려준 합계를 기준으로 거르는 것까지만 본다.
 * "취소된 벌점은 애초에 합계에 안 들어간다"는 repo의 where 절에 있고, 그게
 * 빠지면 취소한 벌점 때문에 선도위 명단에 오르는 학생이 생긴다.
 */
describe("repo.demeritTotalsByStudent — 취소·종류 거르기", () => {
  it("취소된 벌점과 상점은 세지 않는다", async () => {
    const demeritRule = await makeRule({
      track: "SCHOOL",
      kind: "DEMERIT",
      label: "명단용 벌점",
      points: 10,
    });
    const meritRule = await makeRule({
      track: "SCHOOL",
      kind: "MERIT",
      label: "명단용 상점",
      points: 50,
    });
    const student = await makeStudent("w");

    const base = {
      studentProfileId: student,
      year: YEAR,
      track: "SCHOOL",
      occurredOn: OCCURRED_ON,
      note: null,
      awardedByUserId: admin.id,
      awardedByName: "통합테스트",
    };

    // 살아 있는 벌점 10 + 취소된 벌점 10 + 상점 50.
    await prisma.meritAward.create({
      data: { ...base, ruleId: demeritRule, kind: "DEMERIT", label: "명단용 벌점", points: 10 },
    });
    const cancelled = await prisma.meritAward.create({
      data: { ...base, ruleId: demeritRule, kind: "DEMERIT", label: "명단용 벌점", points: 10 },
    });
    await prisma.meritAward.create({
      data: { ...base, ruleId: meritRule, kind: "MERIT", label: "명단용 상점", points: 50 },
    });
    await repo.cancelAward(cancelled.id, {
      userId: admin.id,
      name: admin.name,
      reason: "오기입",
    });

    const rows = await repo.demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: YEAR,
      rosterYear: YEAR,
      studentProfileIds: [student],
    });

    // 살아 있는 벌점 한 건만 — 취소분도 상점도 섞이지 않는다.
    expect(rows).toHaveLength(1);
    expect(rows[0]._sum.points).toBe(10);
  });
});
