import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));

const repo = await import("@/modules/merit/merit.repo");
const { foldClasses } = await import("@/modules/merit/stats.service");
const service = await import("@/modules/merit/award.service");

const YEAR = 2026;
const GRADE = 3;
const CLASS_NO = 2;
const OCCURRED_ON = new Date("2026-06-12T00:00:00+09:00");
const NOW = new Date("2026-08-16T10:00:00+09:00");

const NAME_STEM = "탈퇴검증";
const REMOVED_AWARDER_NAME = "삭제된부여자";

const made = {
  users: [] as string[],
  profiles: [] as string[],
  rules: [] as string[],
};

const admin = {
  id: "merit-removed-admin",
  name: "통합테스트관리자",
  email: "merit-removed-admin@example.invalid",
  role: "ADMIN" as const,
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

const student = {
  ...admin,
  id: "merit-removed-student",
  email: "merit-removed-student@example.invalid",
  role: "STUDENT" as const,
};

let stayingId = "";
let removedId = "";
let noRowId = "";
let ruleId = "";

async function makeStudent(
  suffix: string,
  accountStatus: string,
  enrollment: { status: string; withClass: boolean; number: number | null } | null,
) {
  const user = await prisma.user.create({
    data: {
      id: `merit-removed-u-${suffix}`,
      name: `${NAME_STEM}${suffix}`,
      email: `merit-removed-${suffix}@example.invalid`,
      phone: "010-0000-0000",
      role: "STUDENT",
      status: accountStatus,
      deletedAt: null,
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      studentCode: `RMTEST${suffix}`,
      birthDate: new Date("2009-03-02"),
    },
  });
  if (enrollment) {
    await prisma.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year: YEAR,
        grade: enrollment.withClass ? GRADE : null,
        classNo: enrollment.withClass ? CLASS_NO : null,
        number: enrollment.number,
        status: enrollment.status,
      },
    });
  }
  made.users.push(user.id);
  made.profiles.push(profile.id);
  return profile.id;
}

async function giveDemerit(
  studentProfileId: string,
  points: number,
  awarder: { userId: string | null; name: string } = {
    userId: admin.id,
    name: admin.name,
  },
) {
  return prisma.meritAward.create({
    data: {
      studentProfileId,
      year: YEAR,
      ruleId,
      track: "SCHOOL",
      kind: "DEMERIT",
      label: "무단 외출",
      points,
      occurredOn: OCCURRED_ON,
      note: null,
      awardedByUserId: awarder.userId,
      awardedByName: awarder.name,
    },
  });
}

function countGroups(rows: { _count: { _all: number } }[]): number {
  return rows.reduce((sum, row) => sum + row._count._all, 0);
}

async function statisticsCounts(totalsYear: number | null) {
  const studentProfileIds = [stayingId, removedId, noRowId];
  const [teachers, rules, totals, chart] = await Promise.all([
    repo.teacherTotals({ track: "SCHOOL", totalsYear, rosterYear: YEAR }),
    repo.awardsByRule({
      track: "SCHOOL",
      totalsYear,
      rosterYear: YEAR,
      studentProfileIds,
    }),
    repo.trackTotals({
      track: "SCHOOL",
      totalsYear,
      rosterYear: YEAR,
      studentProfileIds,
    }),
    repo.listAwardsForChart({
      track: "SCHOOL",
      totalsYear,
      rosterYear: YEAR,
      studentProfileIds,
    }),
  ]);

  return {
    teacherTotals: countGroups(
      teachers.byUser.filter((row) => row.awardedByUserId === admin.id),
    ),
    removedAwarderTotals: countGroups(
      teachers.byName.filter((row) => row.awardedByName === REMOVED_AWARDER_NAME),
    ),
    awardsByRule: countGroups(rules.rows.filter((row) => row.ruleId === ruleId)),
    trackTotals: countGroups(totals),
    chart: chart.length,
  };
}

beforeAll(async () => {
  for (const actor of [admin, student]) {
    await prisma.user.upsert({
      where: { id: actor.id },
      create: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        phone: "010-0000-0000",
        role: actor.role,
      },
      update: {},
    });
    made.users.push(actor.id);
  }

  await prisma.academicYear.upsert({
    where: { year: YEAR },
    create: { year: YEAR },
    update: {},
  });
  const current = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (current?.year !== YEAR) {
    await prisma.academicYear.updateMany({ data: { isCurrent: false } });
    await prisma.academicYear.update({
      where: { year: YEAR },
      data: { isCurrent: true },
    });
  }

  const rule = await prisma.meritRule.create({
    data: { track: "SCHOOL", kind: "DEMERIT", label: "무단 외출", points: 5 },
  });
  ruleId = rule.id;
  made.rules.push(rule.id);

  stayingId = await makeStudent("staying", "ACTIVE", {
    status: "ENROLLED",
    withClass: true,
    number: 11,
  });
  removedId = await makeStudent("removed", "INACTIVE", {
    status: "EXPELLED",
    withClass: true,
    number: 12,
  });
  noRowId = await makeStudent("norow", "ACTIVE", null);

  await giveDemerit(stayingId, 5);
  await giveDemerit(removedId, 5);
  await giveDemerit(removedId, 5);
  await giveDemerit(removedId, 5, { userId: null, name: REMOVED_AWARDER_NAME });
  await giveDemerit(noRowId, 5);
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
});

describe("조회는 열린다 — 상세·확인서·내보내기가 타는 경로", () => {
  it("머리글이 돌아오고 학적과 removed가 실려 있다", async () => {
    const header = await service.getStudentHeader(admin, removedId);

    expect(header).not.toBeNull();
    expect(header?.name).toBe(`${NAME_STEM}removed`);
    expect(header?.status).toBe("EXPELLED");
    expect(header?.removed).toBe(true);
  });

  it("재적 줄이 없는 학생도 removed다", async () => {
    const header = await service.getStudentHeader(admin, noRowId);

    expect(header?.status).toBeNull();
    expect(header?.removed).toBe(true);
  });

  it("명단에 남아 있는 학생의 removed는 false다", async () => {
    const header = await service.getStudentHeader(admin, stayingId);

    expect(header?.removed).toBe(false);
    expect(header?.grade).toBe(GRADE);
  });

  it("벌점 내역과 합계가 그대로 나온다 — 선도관리위원회 자료가 이것이다", async () => {
    const view = await service.getStudentMerit(admin, removedId, "SCHOOL");

    expect(view.awards).toHaveLength(3);
    expect(view.totals.demerit).toBe(15);
    expect(view.totals.net).toBe(-15);
  });

  it("학생·학부모는 이 경로로 남의 기록을 볼 수 없다", async () => {
    await expect(service.getStudentHeader(student, removedId)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      service.getStudentMerit(student, removedId, "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("검색 — 명시적으로 요청했을 때만 섞인다", () => {
  it("기본 검색에는 그 학년도 재적만 나온다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM);

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("요청하면 함께 나오고 removed로 구분된다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM, {
      includeRemoved: true,
    });

    expect(new Set(rows.map((r) => r.studentProfileId))).toEqual(
      new Set([stayingId, removedId, noRowId]),
    );

    const byId = new Map(rows.map((r) => [r.studentProfileId, r]));
    expect(byId.get(removedId)?.removed).toBe(true);
    expect(byId.get(removedId)?.status).toBe("EXPELLED");
    expect(byId.get(removedId)?.grade).toBeNull();
    expect(byId.get(noRowId)?.removed).toBe(true);
    expect(byId.get(noRowId)?.status).toBeNull();
    expect(byId.get(stayingId)?.removed).toBe(false);
  });

  it("학생코드로도 찾힌다", async () => {
    const rows = await service.searchStudents(admin, "RMTESTremoved", {
      includeRemoved: true,
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([removedId]);
  });

  it("관리자만 볼 수 있다 — 옵트인해도 학생은 막힌다", async () => {
    await expect(
      service.searchStudents(student, NAME_STEM, { includeRemoved: true }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("기본 목록에는 섞이지 않는다", () => {
  it("반 명단에 안 나온다", async () => {
    const rows = await service.getClassRoster(admin, {
      grade: GRADE,
      classNo: CLASS_NO,
      track: "SCHOOL",
    });

    const ids = rows.map((r) => r.studentProfileId);
    expect(ids).toContain(stayingId);
    expect(ids).not.toContain(removedId);
  });

  it("기준 초과 명단(벌점 합계)에 안 나온다", async () => {
    const rows = await repo.demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: YEAR,
      rosterYear: YEAR,
      studentProfileIds: [stayingId, removedId, noRowId],
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("누적(totalsYear = null)으로 세도 명단에서 빠진 학생은 안 나온다", async () => {
    const rows = await repo.demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: null,
      rosterYear: YEAR,
      studentProfileIds: [stayingId, removedId, noRowId],
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("반별 요약의 인원에도 안 든다", async () => {
    const summaries = foldClasses(
      await repo.listClassRoster({
        year: YEAR,
        track: "SCHOOL",
        totalsYear: YEAR,
      }),
    );
    const mine = summaries.find(
      (row) => row.grade === GRADE && row.classNo === CLASS_NO,
    );

    expect(mine?.students).toBe(1);
    expect(mine?.demerit).toBe(5);
  });
});

describe("통계 모집단도 그 학년도 재적이다", () => {
  it("명시한 id 목록에 퇴학생·학적 없는 학생이 섞여도 재적과 교집합한다", async () => {
    expect(await statisticsCounts(YEAR)).toEqual({
      teacherTotals: 1,
      removedAwarderTotals: 0,
      awardsByRule: 1,
      trackTotals: 1,
      chart: 1,
    });
  });

  it("누적 합계(totalsYear = null)여도 명단 학년도 조건은 유지한다", async () => {
    expect(await statisticsCounts(null)).toEqual({
      teacherTotals: 1,
      removedAwarderTotals: 0,
      awardsByRule: 1,
      trackTotals: 1,
      chart: 1,
    });
  });
});

describe("모집단 통일에서 제외한 집계는 그대로다", () => {
  it("최근 활동 창은 명단 상태와 무관하게 발생한 기록을 센다", async () => {
    const occurredOn = new Date("2099-01-02T00:00:00+09:00");
    const until = new Date("2099-01-03T00:00:00+09:00");
    const award = await prisma.meritAward.create({
      data: {
        studentProfileId: removedId,
        year: YEAR,
        ruleId,
        track: "SCHOOL",
        kind: "DEMERIT",
        label: "무단 외출",
        points: 7,
        occurredOn,
        note: null,
        awardedByUserId: admin.id,
        awardedByName: admin.name,
      },
    });

    let rows: Awaited<ReturnType<typeof repo.trackTotalsBetween>> = [];
    try {
      rows = await repo.trackTotalsBetween({
        track: "SCHOOL",
        since: occurredOn,
        until,
        kinds: ["DEMERIT"],
      });
    } finally {
      await prisma.meritAward.delete({ where: { id: award.id } });
    }

    expect(rows).toEqual([
      { kind: "DEMERIT", _count: { _all: 1 }, _sum: { points: 7 } },
    ]);
  });

  it("퇴학생만 쓴 규정도 unused로 되돌리지 않는다", async () => {
    const rule = await prisma.meritRule.create({
      data: {
        track: "SCHOOL",
        kind: "DEMERIT",
        label: "퇴학생 전용 규정",
        points: 1,
      },
    });
    made.rules.push(rule.id);
    const award = await prisma.meritAward.create({
      data: {
        studentProfileId: removedId,
        year: YEAR,
        ruleId: rule.id,
        track: "SCHOOL",
        kind: "DEMERIT",
        label: rule.label,
        points: 1,
        occurredOn: OCCURRED_ON,
        note: null,
        awardedByUserId: admin.id,
        awardedByName: admin.name,
      },
    });

    let unused: Awaited<ReturnType<typeof repo.unusedRules>> = [];
    try {
      unused = await repo.unusedRules({ track: "SCHOOL", totalsYear: YEAR });
    } finally {
      await prisma.meritAward.delete({ where: { id: award.id } });
      await prisma.meritRule.delete({ where: { id: rule.id } });
    }

    expect(unused.map((row) => row.id)).not.toContain(rule.id);
  });
});

describe("부여는 열지 않는다", () => {
  it("findAwardableStudent는 재적이 아닌 학생을 못 찾는다", async () => {
    expect(await repo.findAwardableStudent(removedId, YEAR)).toBeNull();
    expect(await repo.findAwardableStudent(stayingId, YEAR)).not.toBeNull();
  });

  it("그 학년도 재적 줄이 없는 학생도 부여 대상이 아니다", async () => {
    expect(await repo.findAwardableStudent(noRowId, YEAR)).toBeNull();
  });

  it("다른 학년도로 물으면 재학생도 안 나온다", async () => {
    expect(await repo.findAwardableStudent(stayingId, YEAR - 1)).toBeNull();
  });

  it("단건 부여는 STUDENT_NOT_FOUND로 거부된다", async () => {
    await expect(
      service.awardMerit(
        admin,
        { studentProfileId: removedId, ruleId, note: null },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: removedId } }),
    ).toBe(3);
  });

  it("재적 줄이 없는 학생에게도 단건 부여가 막힌다", async () => {
    await expect(
      service.awardMerit(
        admin,
        { studentProfileId: noRowId, ruleId, note: null },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: noRowId } }),
    ).toBe(1);
  });

  it("일괄 부여는 한 명만 빠져도 아무도 받지 않는다", async () => {
    await expect(
      service.bulkAwardMerit(
        admin,
        {
          studentProfileIds: [stayingId, removedId],
          ruleId,
          note: null,
        },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: stayingId } }),
    ).toBe(1);
  });

  it("재학생에게는 부여된다", async () => {
    await service.awardMerit(
      admin,
      { studentProfileId: stayingId, ruleId, note: null },
      NOW,
    );

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: stayingId } }),
    ).toBe(2);
  });
});

describe("취소는 그대로 된다", () => {
  it("명단에서 빠진 학생의 기록도 취소할 수 있다", async () => {
    const award = await giveDemerit(removedId, 3);

    await service.cancelAward(admin, { awardId: award.id, reason: "오기입" });

    const row = await prisma.meritAward.findUnique({ where: { id: award.id } });
    expect(row?.status).toBe("CANCELLED");

    const view = await service.getStudentMerit(admin, removedId, "SCHOOL");
    expect(view.totals.demerit).toBe(15);
    expect(view.awards).toHaveLength(4);
  });
});
