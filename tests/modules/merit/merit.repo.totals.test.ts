import { beforeEach, describe, expect, it, vi } from "vitest";

const enrollmentFindMany = vi.fn();
const meritAwardGroupBy = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    enrollment: { findMany: enrollmentFindMany },
    meritAward: { groupBy: meritAwardGroupBy },
  },
}));

const { classSummaries, demeritTotalsByStudent, listClassRoster } = await import(
  "@/modules/merit/merit.repo"
);

/**
 * repo의 집계 세 곳.
 *
 * 예전엔 종류→칸 접기와 `net = 상점 + 상쇄 − 벌점`이 여기 두 함수와 서비스·그래프에
 * 각각 복제돼 있었는데 **어느 것도 테스트가 없었다.** 넷 중 하나만 잘못 고치면 같은
 * 학생의 순점수가 학생 상세·반 명단·통계에서 서로 다르게 뜬다. 계산 자체는
 * merit-track으로 모았고, 여기서는 그 헬퍼가 실제로 물려 있는지를 본다.
 */
beforeEach(() => {
  enrollmentFindMany.mockReset().mockResolvedValue([]);
  meritAwardGroupBy.mockReset().mockResolvedValue([]);
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
  it("상쇄점이 순점수를 올린다 — 상점 칸에는 섞이지 않는다", async () => {
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

  it("totalsYear가 null이면 학년도 조건 없이 센다 — 기숙사(누적)다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);

    await listClassRoster({ ...roster, track: "DORM", totalsYear: null });

    expect(meritAwardGroupBy.mock.calls[0][0].where).not.toHaveProperty("year");
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
  it("기록이 없는 학생도 인원에 든다 — 평균의 분모다", async () => {
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
