import { beforeEach, describe, expect, it, vi } from "vitest";

const enrollmentFindMany = vi.fn();
const meritAwardGroupBy = vi.fn();
const meritAwardFindMany = vi.fn();
const meritRuleFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    enrollment: { findMany: enrollmentFindMany },
    meritAward: { groupBy: meritAwardGroupBy, findMany: meritAwardFindMany },
    meritRule: { findMany: meritRuleFindMany },
  },
}));

const {
  awardsByRule,
  demeritTotalsByStudent,
  listAwardsForChart,
  listClassRoster,
  teacherTotals,
  totals,
  trackTotals,
  trackTotalsBetween,
  unusedRules,
} = await import("@/modules/merit/merit.repo");

beforeEach(() => {
  enrollmentFindMany.mockReset().mockResolvedValue([]);
  meritAwardGroupBy.mockReset().mockResolvedValue([]);
  meritAwardFindMany.mockReset().mockResolvedValue([]);
  meritRuleFindMany.mockReset().mockResolvedValue([]);
});

function enrolled(id: string, number: number, grade = 2, classNo = 3) {
  return {
    number,
    studentProfileId: id,
    grade,
    classNo,
    studentProfile: {
      id,
      studentCode: `CODE-${id}`,
      user: { name: `학생${id}` },
    },
  };
}

function sum(studentProfileId: string, kind: string, points: number) {
  return { studentProfileId, kind, _sum: { points } };
}

const roster = { year: 2026, grade: 2, classNo: 3, track: "SCHOOL" } as const;

describe("totals — 개인 이력 합계", () => {
  it("명단에서 빠진 학생도 직접 id로 과거 기록을 조회한다", async () => {
    await totals({ studentProfileId: "sp-removed", track: "SCHOOL", year: 2025 });

    const { where } = meritAwardGroupBy.mock.calls[0][0];
    expect(where).toEqual({
      studentProfileId: "sp-removed",
      track: "SCHOOL",
      status: "ACTIVE",
      year: 2025,
    });
    expect(where).not.toHaveProperty("studentProfile");
  });
});

describe("listClassRoster — 반 명단 합계", () => {
  it("종류별로 자기 칸에 담고 순점수를 낸다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);
    meritAwardGroupBy.mockResolvedValue([
      sum("sp-1", "MERIT", 10),
      sum("sp-1", "DEMERIT", 4),
    ]);

    const rows = await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(rows).toEqual([
      {
        studentProfileId: "sp-1",
        studentCode: "CODE-sp-1",
        name: "학생sp-1",
        grade: 2,
        classNo: 3,
        number: 1,
        merit: 10,
        demerit: 4,
        offset: 0,
        net: 6,
      },
    ]);
  });

  it("상쇄점이 순점수를 올린다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);
    meritAwardGroupBy.mockResolvedValue([
      sum("sp-1", "DEMERIT", 30),
      sum("sp-1", "OFFSET", 20),
    ]);

    const [row] = await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(row.merit).toBe(0);
    expect(row.offset).toBe(20);
    expect(row.net).toBe(-10);
  });

  it("기록이 하나도 없는 학생도 0으로 명단에 남는다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1), enrolled("sp-2", 2)]);
    meritAwardGroupBy.mockResolvedValue([sum("sp-1", "MERIT", 5)]);

    const rows = await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(
      expect.objectContaining({ studentProfileId: "sp-2", merit: 0, net: 0 }),
    );
  });

  it("남의 합계가 섞이지 않는다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1), enrolled("sp-2", 2)]);
    meritAwardGroupBy.mockResolvedValue([
      sum("sp-1", "MERIT", 5),
      sum("sp-2", "DEMERIT", 7),
    ]);

    const rows = await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(rows[0].net).toBe(5);
    expect(rows[1].net).toBe(-7);
  });

  it("학생이 없으면 합계 질의를 하지 않는다", async () => {
    enrollmentFindMany.mockResolvedValue([]);

    expect(await listClassRoster({ ...roster, totalsYear: 2026 })).toEqual([]);
    expect(meritAwardGroupBy).not.toHaveBeenCalled();
  });

  it("totalsYear가 null이면 학년도 조건 없이 센다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);

    await listClassRoster({ ...roster, track: "DORM", totalsYear: null });

    expect(meritAwardGroupBy.mock.calls[0][0].where).not.toHaveProperty("year");
  });

  it("그 학년도 그 반의 재학생만 본다", async () => {
    await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).toEqual({
      year: 2026,
      status: "ENROLLED",
      grade: 2,
      classNo: 3,
    });
  });

  it("합계도 명단 id와 그 학년도 재적 조건을 함께 건다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);

    await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(meritAwardGroupBy.mock.calls[0][0].where).toEqual({
      studentProfileId: { in: ["sp-1"] },
      studentProfile: {
        enrollments: { some: { year: 2026, status: "ENROLLED" } },
      },
      track: "SCHOOL",
      status: "ACTIVE",
      year: 2026,
    });
  });

  it("학년 · 반 · 번호 순으로 가져온다", async () => {
    await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].orderBy).toEqual([
      { grade: "asc" },
      { classNo: "asc" },
      { number: "asc" },
    ]);
  });

  it("학년·반을 안 주면 반 조건 자체를 걸지 않는다", async () => {
    await listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).not.toHaveProperty("grade");
    expect(enrollmentFindMany.mock.calls[0][0].where).not.toHaveProperty("classNo");
  });

  it("학년만 주면 그 학년으로만 좁힌다", async () => {
    await listClassRoster({ year: 2026, grade: 2, track: "SCHOOL", totalsYear: 2026 });

    const where = enrollmentFindMany.mock.calls[0][0].where;
    expect(where.grade).toBe(2);
    expect(where).not.toHaveProperty("classNo");
  });
});

describe("listClassRoster — 범위 없이 부르면 전교다", () => {
  it("그 학년도 재학생만 본다", async () => {
    await listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).toEqual({
      year: 2026,
      status: "ENROLLED",
    });
  });

  it("반으로 거르지 않는다 — 반 미배정이 놓치기 가장 쉬운 자리다", async () => {
    enrollmentFindMany.mockResolvedValue([
      { ...enrolled("sp-1", 1), grade: null, classNo: null },
    ]);

    const rows = await listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).not.toHaveProperty("grade");
    expect(enrollmentFindMany.mock.calls[0][0].where).not.toHaveProperty("classNo");
    expect(rows[0]).toEqual(
      expect.objectContaining({ studentProfileId: "sp-1", grade: null, classNo: null }),
    );
  });

  it("기록이 없는 학생도 0으로 남는다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1), enrolled("sp-2", 2)]);
    meritAwardGroupBy.mockResolvedValue([sum("sp-1", "MERIT", 5)]);

    const rows = await listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(rows.map((r) => r.net)).toEqual([5, 0]);
  });

  it("재적이 없으면 합계 질의를 하지 않는다", async () => {
    expect(
      await listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
    ).toEqual([]);
    expect(meritAwardGroupBy).not.toHaveBeenCalled();
  });
});

describe("demeritTotalsByStudent — 기준 초과 명단의 원자료", () => {
  it("벌점만, 취소되지 않은 것만, 그 학년도 재적만 센다", async () => {
    await demeritTotalsByStudent({ track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 });

    expect(meritAwardGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["studentProfileId"],
        where: expect.objectContaining({
          track: "SCHOOL",
          kind: "DEMERIT",
          status: "ACTIVE",
          year: 2026,
          studentProfile: {
            enrollments: { some: { year: 2026, status: "ENROLLED" } },
          },
        }),
      }),
    );
  });

  it("totalsYear가 null이어도 재적 조건은 남는다", async () => {
    await demeritTotalsByStudent({ track: "DORM", totalsYear: null, rosterYear: 2026 });

    const where = meritAwardGroupBy.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("year");
    expect(where.studentProfile).toEqual({
      enrollments: { some: { year: 2026, status: "ENROLLED" } },
    });
  });

  it("rosterYear는 totalsYear와 따로 걸린다", async () => {
    await demeritTotalsByStudent({ track: "SCHOOL", totalsYear: 2025, rosterYear: 2025 });

    const where = meritAwardGroupBy.mock.calls[0][0].where;
    expect(where.year).toBe(2025);
    expect(where.studentProfile).toEqual({
      enrollments: { some: { year: 2025, status: "ENROLLED" } },
    });
  });

  it("학생을 좁혀 주면 그 학생들만 센다", async () => {
    await demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: 2026,
      rosterYear: 2026,
      studentProfileIds: ["sp-1", "sp-2"],
    });

    expect(meritAwardGroupBy.mock.calls[0][0].where.studentProfileId).toEqual({
      in: ["sp-1", "sp-2"],
    });
  });
});

describe("awardsByRule — 규정별 집계 원자료", () => {
  it("스냅샷별 groupBy 결과와 현재 규정 메타데이터를 그대로 돌려준다", async () => {
    const rows = [
      {
        ruleId: "rule-1",
        label: "지각",
        kind: "DEMERIT",
        _count: { _all: 3 },
        _sum: { points: 6 },
      },
    ];
    const rules = [
      {
        id: "rule-1",
        label: "등교 지각",
        category: "생활",
        active: true,
      },
    ];
    meritAwardGroupBy.mockResolvedValue(rows);
    meritRuleFindMany.mockResolvedValue(rules);

    const result = await awardsByRule({
      track: "SCHOOL",
      totalsYear: 2026,
      rosterYear: 2026,
    });

    expect(meritAwardGroupBy).toHaveBeenCalledWith({
      by: ["ruleId", "label", "kind"],
      where: {
        track: "SCHOOL",
        status: "ACTIVE",
        year: 2026,
        studentProfile: {
          enrollments: { some: { year: 2026, status: "ENROLLED" } },
        },
      },
      _count: { _all: true },
      _sum: { points: true },
    });
    expect(meritRuleFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["rule-1"] } },
      select: { id: true, label: true, category: true, active: true },
    });
    expect(result).toEqual({ rows, rules });
  });

  it("집계 행이 없으면 규정 조회를 생략한다", async () => {
    expect(
      await awardsByRule({ track: "DORM", totalsYear: null, rosterYear: 2026 }),
    ).toEqual({ rows: [], rules: [] });
    expect(meritRuleFindMany).not.toHaveBeenCalled();
  });
});

describe("trackTotalsBetween", () => {
  it("입력 시각이 아니라 발생일에 창을 건다", async () => {
    const since = new Date("2026-08-10T00:00:00+09:00");
    const until = new Date("2026-08-17T00:00:00+09:00");

    await trackTotalsBetween({
      track: "SCHOOL",
      since,
      until,
      kinds: ["MERIT", "DEMERIT"],
    });

    const { where } = meritAwardGroupBy.mock.calls[0][0];
    expect(where.occurredOn).toEqual({ gte: since, lt: until });
    expect(where.createdAt).toBeUndefined();
  });

  it("취소된 기록과 창 밖의 종류는 세지 않는다", async () => {
    await trackTotalsBetween({
      track: "DORM",
      since: new Date("2026-08-10T00:00:00+09:00"),
      until: new Date("2026-08-17T00:00:00+09:00"),
      kinds: ["MERIT", "DEMERIT"],
    });

    const { where } = meritAwardGroupBy.mock.calls[0][0];
    expect(where.status).toBe("ACTIVE");
    expect(where.track).toBe("DORM");
    expect(where.kind).toEqual({ in: ["MERIT", "DEMERIT"] });
  });

  it("학년도로는 자르지 않는다 — 3월 초 창이 두 학년도에 걸친다", async () => {
    await trackTotalsBetween({
      track: "SCHOOL",
      since: new Date("2027-02-25T00:00:00+09:00"),
      until: new Date("2027-03-04T00:00:00+09:00"),
      kinds: ["MERIT", "DEMERIT"],
    });

    const { where } = meritAwardGroupBy.mock.calls[0][0];
    expect(where.year).toBeUndefined();
    expect(where).not.toHaveProperty("studentProfile");
    expect(where).not.toHaveProperty("studentProfileId");
  });

  it("건수와 점수를 함께 낸다 — 화면이 부여 건수를 쓴다", async () => {
    await trackTotalsBetween({
      track: "SCHOOL",
      since: new Date("2026-08-10T00:00:00+09:00"),
      until: new Date("2026-08-17T00:00:00+09:00"),
      kinds: ["MERIT", "DEMERIT"],
    });

    const call = meritAwardGroupBy.mock.calls[0][0];
    expect(call.by).toEqual(["kind"]);
    expect(call._count).toEqual({ _all: true });
    expect(call._sum).toEqual({ points: true });
  });
});

describe("취소된 기록은 어느 집계에도 안 든다", () => {
  beforeEach(() => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);
  });

  const CASES = [
    {
      name: "trackTotals",
      run: () =>
        trackTotals({ track: "DORM", totalsYear: 2026, rosterYear: 2026 }),
      mock: meritAwardGroupBy,
      track: "DORM",
    },
    {
      name: "awardsByRule",
      run: () =>
        awardsByRule({ track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 }),
      mock: meritAwardGroupBy,
      track: "SCHOOL",
    },
    {
      name: "teacherTotals",
      run: () =>
        teacherTotals({ track: "DORM", totalsYear: 2026, rosterYear: 2026 }),
      mock: meritAwardGroupBy,
      track: "DORM",
    },
    {
      name: "listAwardsForChart",
      run: () =>
        listAwardsForChart({ track: "DORM", totalsYear: 2026, rosterYear: 2026 }),
      mock: meritAwardFindMany,
      track: "DORM",
    },
    {
      name: "listClassRoster",
      run: () => listClassRoster({ ...roster, track: "DORM", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
      track: "DORM",
    },
    {
      name: "listClassRoster (전교)",
      run: () => listClassRoster({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
      track: "SCHOOL",
    },
  ];

  it.each(CASES)("$name", async ({ run, mock, track }) => {
    await run();

    expect(mock).toHaveBeenCalled();
    expect(mock.mock.calls[0][0].where).toMatchObject({
      track,
      status: "ACTIVE",
      year: 2026,
    });
  });

  it("unusedRules도 같은 트랙·상태·학년도의 부여 기록만 대조한다", async () => {
    await unusedRules({ track: "DORM", totalsYear: 2026 });

    expect(meritRuleFindMany.mock.calls[0][0].where).toEqual({
      track: "DORM",
      active: true,
      awards: { none: { status: "ACTIVE", year: 2026 } },
    });
  });

  it("teacherTotals는 계정이 사라진 갈래에도 같은 조건을 건다", async () => {
    await teacherTotals({ track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 });

    expect(meritAwardGroupBy).toHaveBeenCalledTimes(2);
    for (const [args] of meritAwardGroupBy.mock.calls) {
      expect(args.where.status).toBe("ACTIVE");
      expect(args.where.track).toBe("SCHOOL");
      expect(args.where.year).toBe(2026);
      expect(args.where.studentProfile).toEqual({
        enrollments: { some: { year: 2026, status: "ENROLLED" } },
      });
    }
    expect(meritAwardGroupBy.mock.calls[0][0].where.awardedByUserId).toEqual({
      not: null,
    });
    expect(meritAwardGroupBy.mock.calls[1][0].where.awardedByUserId).toBeNull();
  });
});

describe("통계 화면 집계의 학생 모집단", () => {
  const POPULATION_CASES = [
    {
      name: "trackTotals",
      runWithRoster: () =>
        trackTotals({ track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 }),
      runWithIds: () =>
        trackTotals({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: ["sp-1", "sp-2"],
        }),
      runWithEmptyIds: () =>
        trackTotals({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: [],
        }),
      mock: meritAwardGroupBy,
    },
    {
      name: "awardsByRule",
      runWithRoster: () =>
        awardsByRule({ track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 }),
      runWithIds: () =>
        awardsByRule({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: ["sp-1", "sp-2"],
        }),
      runWithEmptyIds: () =>
        awardsByRule({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: [],
        }),
      mock: meritAwardGroupBy,
    },
    {
      name: "listAwardsForChart",
      runWithRoster: () =>
        listAwardsForChart({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
        }),
      runWithIds: () =>
        listAwardsForChart({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: ["sp-1", "sp-2"],
        }),
      runWithEmptyIds: () =>
        listAwardsForChart({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: [],
        }),
      mock: meritAwardFindMany,
    },
    {
      name: "demeritTotalsByStudent",
      runWithRoster: () =>
        demeritTotalsByStudent({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
        }),
      runWithIds: () =>
        demeritTotalsByStudent({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: ["sp-1", "sp-2"],
        }),
      runWithEmptyIds: () =>
        demeritTotalsByStudent({
          track: "SCHOOL",
          totalsYear: 2026,
          rosterYear: 2026,
          studentProfileIds: [],
        }),
      mock: meritAwardGroupBy,
    },
  ];

  it.each(POPULATION_CASES)(
    "$name — 명단 학년도를 주면 그 해 재학생만 센다",
    async ({ runWithRoster, mock }) => {
      await runWithRoster();

      const where = mock.mock.calls.at(-1)![0].where;
      expect(where.studentProfile).toEqual({
        enrollments: { some: { year: 2026, status: "ENROLLED" } },
      });
      expect(where).not.toHaveProperty("studentProfileId");
    },
  );

  it.each(POPULATION_CASES)(
    "$name — 학생 목록을 주어도 재적 조건과 AND한다",
    async ({ runWithIds, mock }) => {
      await runWithIds();

      const where = mock.mock.calls.at(-1)![0].where;
      expect(where.studentProfileId).toEqual({ in: ["sp-1", "sp-2"] });
      expect(where.studentProfile).toEqual({
        enrollments: { some: { year: 2026, status: "ENROLLED" } },
      });
    },
  );

  it.each(POPULATION_CASES)(
    "$name — 빈 학생 목록도 빈 모집단으로 유지하고 재적 조건을 남긴다",
    async ({ runWithEmptyIds, mock }) => {
      await runWithEmptyIds();

      const where = mock.mock.calls.at(-1)![0].where;
      expect(where.studentProfileId).toEqual({ in: [] });
      expect(where.studentProfile).toEqual({
        enrollments: { some: { year: 2026, status: "ENROLLED" } },
      });
    },
  );
});
