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
  classSummaries,
  demeritTotalsByStudent,
  listAwardsForChart,
  listClassRoster,
  ruleStats,
  studentTotals,
  teacherTotals,
  topRules,
  trackTotals,
  trackTotalsBetween,
} = await import("@/modules/merit/merit.repo");

/**
 * repo의 집계들. 계산은 merit-track에 모여 있고, 여기서는 그 헬퍼가 실제로
 * 물려 있는지를 본다 — 하나만 어긋나도 화면마다 순점수가 달라진다.
 * 명단에서 출발하는 질의는 재적 where 절도 함께 못 박는다: 목이 값만 돌려주면
 * 재학·소프트삭제 조건을 지워도 결과가 그대로라 아무 테스트도 깨지지 않는다.
 */
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
    schoolClass: { grade, classNo },
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
        number: 1,
        merit: 10,
        demerit: 4,
        offset: 0,
        net: 6,
      },
    ]);
  });

  /** 상쇄점을 순점수에서 빠뜨리면 선도위원회 의결이 화면에 반영되지 않는다. */
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

  /**
   * 재학 조건이 빠지면 전학·자퇴한 학생이 반 명단에 되살아나고, 소프트삭제
   * 조건이 빠지면 명단에서 뺀 학생이 다시 선다. 둘 다 값만 보는 목으로는
   * 드러나지 않는다 — where 절을 직접 본다.
   */
  it("그 학년도 그 반의 재학생만, 지워진 계정은 빼고 본다", async () => {
    await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).toMatchObject({
      year: 2026,
      status: "ENROLLED",
      schoolClass: { grade: 2, classNo: 3 },
      studentProfile: { user: { deletedAt: null } },
    });
  });

  it("명단은 번호순으로 가져온다 — 담임이 읽는 순서가 그 순서다", async () => {
    await listClassRoster({ ...roster, totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].orderBy).toEqual({ number: "asc" });
  });
});

describe("classSummaries — 반별 요약", () => {
  it("반 안의 학생 합계를 칸별로 모으고 순점수·평균을 낸다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1), enrolled("sp-2", 2)]);
    meritAwardGroupBy.mockResolvedValue([
      sum("sp-1", "MERIT", 10),
      sum("sp-1", "DEMERIT", 4),
      sum("sp-2", "MERIT", 2),
    ]);

    const [row] = await classSummaries({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    expect(row).toEqual({
      grade: 2,
      classNo: 3,
      students: 2,
      merit: 12,
      demerit: 4,
      offset: 0,
      net: 8,
      avgNet: 4,
    });
  });

  it("상쇄점이 반 순점수에도 들어간다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);
    meritAwardGroupBy.mockResolvedValue([
      sum("sp-1", "DEMERIT", 30),
      sum("sp-1", "OFFSET", 20),
    ]);

    const [row] = await classSummaries({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    expect(row.offset).toBe(20);
    expect(row.net).toBe(-10);
  });

  /** 기록이 없는 학생이 분모에서 빠지면 평균이 부풀어 반끼리 비교가 안 된다. */
  it("기록이 없는 학생도 인원에 든다", async () => {
    enrollmentFindMany.mockResolvedValue([
      enrolled("sp-1", 1),
      enrolled("sp-2", 2),
      enrolled("sp-3", 3),
    ]);
    meritAwardGroupBy.mockResolvedValue([sum("sp-1", "MERIT", 9)]);

    const [row] = await classSummaries({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    expect(row.students).toBe(3);
    expect(row.avgNet).toBe(3);
  });

  it("학년·반 순으로 세운다", async () => {
    enrollmentFindMany.mockResolvedValue([
      enrolled("sp-1", 1, 3, 1),
      enrolled("sp-2", 1, 1, 2),
      enrolled("sp-3", 1, 1, 1),
    ]);

    const rows = await classSummaries({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    expect(rows.map((r) => `${r.grade}-${r.classNo}`)).toEqual(["1-1", "1-2", "3-1"]);
  });

  it("재적이 없으면 합계 질의를 하지 않는다", async () => {
    enrollmentFindMany.mockResolvedValue([]);

    expect(
      await classSummaries({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
    ).toEqual([]);
    expect(meritAwardGroupBy).not.toHaveBeenCalled();
  });

  /** 반별로 접는 것이 목적이라 반 미배정은 여기서만 뺀다 — studentTotals는 남긴다. */
  it("그 학년도 재학생 중 반이 있는 학생만, 지워진 계정은 빼고 본다", async () => {
    await classSummaries({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).toMatchObject({
      year: 2026,
      status: "ENROLLED",
      studentProfile: { user: { deletedAt: null } },
      classId: { not: null },
    });
  });
});

/**
 * 전교 명단 합계. listClassRoster와 같은 규칙이되 반 조건이 없다 —
 * 반 미배정 학생이 순위에서 사라지면 안 된다.
 */
describe("studentTotals — 전교 학생 합계", () => {
  it("그 학년도 재학생만, 지워진 계정은 빼고 본다", async () => {
    await studentTotals({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).toMatchObject({
      year: 2026,
      status: "ENROLLED",
      studentProfile: { user: { deletedAt: null } },
    });
  });

  it("반으로 거르지 않는다 — 반 미배정이 놓치기 가장 쉬운 자리다", async () => {
    enrollmentFindMany.mockResolvedValue([
      { ...enrolled("sp-1", 1), schoolClass: null },
    ]);

    const rows = await studentTotals({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(enrollmentFindMany.mock.calls[0][0].where).not.toHaveProperty("classId");
    expect(rows[0]).toEqual(
      expect.objectContaining({ studentProfileId: "sp-1", grade: null, classNo: null }),
    );
  });

  it("기록이 없는 학생도 0으로 남는다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1), enrolled("sp-2", 2)]);
    meritAwardGroupBy.mockResolvedValue([sum("sp-1", "MERIT", 5)]);

    const rows = await studentTotals({ year: 2026, track: "SCHOOL", totalsYear: 2026 });

    expect(rows.map((r) => r.net)).toEqual([5, 0]);
  });

  it("재적이 없으면 합계 질의를 하지 않는다", async () => {
    expect(
      await studentTotals({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
    ).toEqual([]);
    expect(meritAwardGroupBy).not.toHaveBeenCalled();
  });
});

describe("demeritTotalsByStudent — 기준 초과 명단의 원자료", () => {
  it("벌점만, 취소되지 않은 것만, 지워진 계정은 빼고 센다", async () => {
    await demeritTotalsByStudent({ track: "SCHOOL", totalsYear: 2026 });

    expect(meritAwardGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["studentProfileId"],
        where: expect.objectContaining({
          track: "SCHOOL",
          kind: "DEMERIT",
          status: "ACTIVE",
          year: 2026,
          studentProfile: { user: { deletedAt: null } },
        }),
      }),
    );
  });

  it("totalsYear가 null이면 학년도 조건이 없다", async () => {
    await demeritTotalsByStudent({ track: "DORM", totalsYear: null });

    expect(meritAwardGroupBy.mock.calls[0][0].where).not.toHaveProperty("year");
  });

  it("학생을 좁혀 주면 그 학생들만 센다", async () => {
    await demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: 2026,
      studentProfileIds: ["sp-1", "sp-2"],
    });

    expect(meritAwardGroupBy.mock.calls[0][0].where.studentProfileId).toEqual({
      in: ["sp-1", "sp-2"],
    });
  });
});

/**
 * 창 집계의 조건. 서비스 쪽 테스트는 인자가 넘어가는 것까지만 보므로,
 * 그 인자가 실제로 어느 칸에 걸리는지는 여기서 못 박는다 — occurredOn을
 * createdAt으로 바꿔도 서비스 테스트는 그대로 통과한다.
 */
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

    expect(meritAwardGroupBy.mock.calls[0][0].where.year).toBeUndefined();
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

/**
 * 취소분 제외. `status: "ACTIVE"`는 repo의 where 절에만 있고 서비스 테스트는
 * 넘어온 값만 보므로, 이 조건을 지워도 다른 테스트는 전부 통과한다 —
 * 취소한 벌점이 합계·순위·통계에 되살아나는 것을 아무도 못 잡는다.
 * 질의마다 한 줄씩 못 박아 그 구멍을 덮는다.
 */
describe("취소된 기록은 어느 집계에도 안 든다", () => {
  /** 명단에서 출발하는 질의는 재적이 있어야 합계 질의까지 간다. */
  beforeEach(() => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);
  });

  const CASES = [
    {
      name: "trackTotals",
      run: () => trackTotals({ track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "topRules",
      run: () => topRules({ track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "teacherTotals",
      run: () => teacherTotals({ track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "ruleStats",
      run: () => ruleStats({ track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "listAwardsForChart",
      run: () => listAwardsForChart({ track: "SCHOOL", year: 2026 }),
      mock: meritAwardFindMany,
    },
    {
      name: "listClassRoster",
      run: () => listClassRoster({ ...roster, totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "classSummaries",
      run: () => classSummaries({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
    {
      name: "studentTotals",
      run: () => studentTotals({ year: 2026, track: "SCHOOL", totalsYear: 2026 }),
      mock: meritAwardGroupBy,
    },
  ];

  it.each(CASES)("$name", async ({ run, mock }) => {
    await run();

    expect(mock).toHaveBeenCalled();
    expect(mock.mock.calls[0][0].where.status).toBe("ACTIVE");
  });

  /**
   * 부여자별 집계만 두 갈래로 나뉜다 — 계정이 지워진 쪽(awardedByUserId: null)은
   * 별개의 질의라 첫 호출만 보면 조건이 빠져도 안 잡힌다.
   */
  it("teacherTotals는 계정이 사라진 갈래에도 같은 조건을 건다", async () => {
    await teacherTotals({ track: "SCHOOL", totalsYear: 2026 });

    expect(meritAwardGroupBy).toHaveBeenCalledTimes(2);
    for (const [args] of meritAwardGroupBy.mock.calls) {
      expect(args.where.status).toBe("ACTIVE");
      expect(args.where.track).toBe("SCHOOL");
      expect(args.where.year).toBe(2026);
    }
    expect(meritAwardGroupBy.mock.calls[0][0].where.awardedByUserId).toEqual({
      not: null,
    });
    expect(meritAwardGroupBy.mock.calls[1][0].where.awardedByUserId).toBeNull();
  });
});
