import { beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "../../helpers/session";

/**
 * 기준 초과 학생 명단. 명단이 한 명 짧아도 화면은 멀쩡해 보이므로 경계값과
 * 집계 범위를 못 박아 둔다. 기준은 목으로 고정한다 — 코드 기본값을 쓰면
 * "설정을 읽는가"가 아니라 "상수가 무엇인가"를 검증하게 된다.
 */

const WARN = 12;
const DANGER = 18;

const getDemeritThresholds = vi.fn();

const trackTotals = vi.fn();
const topRules = vi.fn();
const listAwardsForChart = vi.fn();
const listClassRoster = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  trackTotals,
  topRules,
  listAwardsForChart,
  listClassRoster,
  demeritTotalsByStudent,
  findStudentsWithClass,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
  AcademicYearError: class extends Error {},
}));
vi.mock("@/modules/merit/threshold.service", () => ({ getDemeritThresholds }));

const service = await import("@/modules/merit/stats.service");

const admin = user("ADMIN", "u-1", { name: "이정민" });
const NOW = new Date("2026-08-16T12:00:00+09:00");

/** repo.demeritTotalsByStudent가 내는 모양. */
function sum(id: string, points: number) {
  return { studentProfileId: id, _sum: { points } };
}

/** repo.findStudentsWithClass가 내는 모양. */
function student(id: string, name: string, enrolled = true) {
  return {
    id,
    studentCode: `CODE-${id}`,
    user: { name },
    enrollments: enrolled
      ? [{ grade: 2, classNo: 3, number: 3 }]
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDemeritThresholds.mockResolvedValue({ warn: WARN, danger: DANGER });
  trackTotals.mockResolvedValue([]);
  topRules.mockResolvedValue([]);
  listAwardsForChart.mockResolvedValue([]);
  listClassRoster.mockResolvedValue([]);
  demeritTotalsByStudent.mockResolvedValue([]);
  findStudentsWithClass.mockResolvedValue([]);
});

describe("기준 초과 명단 — 경계", () => {
  it(`기준(${WARN}점) 정확히면 포함한다`, async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", WARN)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList.map((r) => r.studentProfileId)).toEqual(["sp-1"]);
    expect(stats.watchList[0].demerit).toBe(WARN);
  });

  it(`기준보다 1점 낮으면 뺀다 — 신원 조회조차 하지 않는다`, async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", WARN - 1)]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList).toEqual([]);
    expect(findStudentsWithClass).not.toHaveBeenCalled();
  });

  it("위험 기준을 넘으면 danger 단계가 붙는다", async () => {
    demeritTotalsByStudent.mockResolvedValue([
      sum("sp-1", DANGER),
      sum("sp-2", WARN),
    ]);
    findStudentsWithClass.mockResolvedValue([
      student("sp-1", "정하윤"),
      student("sp-2", "오세훈"),
    ]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList[0].level).toBe("danger");
    expect(stats.watchList[1].level).toBe("warn");
  });

  it("설정된 기준 숫자를 화면으로 내보낸다", async () => {
    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);
    expect(stats.thresholds).toEqual({ warn: WARN, danger: DANGER });
  });

  it("기준을 바꾸면 명단이 달라진다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", 10)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    // 기준 12점 — 10점은 아직 명단에 안 오른다.
    const before = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);
    expect(before.watchList).toEqual([]);

    // 학교가 기준을 8점으로 낮추면 같은 학생이 명단에 오른다.
    getDemeritThresholds.mockResolvedValue({ warn: 8, danger: 15 });
    const after = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);
    expect(after.watchList.map((r) => r.name)).toEqual(["김민준"]);
    expect(after.watchList[0].level).toBe("warn");
  });

  it("트랙마다 자기 기준을 읽는다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);
    expect(getDemeritThresholds).toHaveBeenCalledWith("DORM");
  });
});

describe("기준 초과 명단 — 순서와 소속", () => {
  it("재학생 소속을 학년·반·번호로 유지한다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", DANGER)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList[0]).toEqual(
      expect.objectContaining({ grade: 2, classNo: 3, number: 3 }),
    );
  });

  it("벌점이 많은 순이고, 같으면 이름순이다", async () => {
    demeritTotalsByStudent.mockResolvedValue([
      sum("sp-a", WARN),
      sum("sp-b", DANGER + 10),
      sum("sp-c", WARN),
    ]);
    findStudentsWithClass.mockResolvedValue([
      student("sp-a", "한지우"),
      student("sp-b", "정하윤"),
      student("sp-c", "김민준"),
    ]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList.map((r) => r.name)).toEqual(["정하윤", "김민준", "한지우"]);
  });

  it("소속이 없어도 명단에 남는다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", DANGER)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준", false)]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList).toHaveLength(1);
    expect(stats.watchList[0].grade).toBeNull();
    expect(stats.watchList[0].classNo).toBeNull();
  });

  it("신원을 못 찾은 합계는 줄을 만들지 않는다", async () => {
    demeritTotalsByStudent.mockResolvedValue([
      sum("sp-1", DANGER),
      sum("sp-gone", DANGER),
    ]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList.map((r) => r.studentProfileId)).toEqual(["sp-1"]);
  });
});

describe("기준 초과 명단 — 집계 범위", () => {
  it("교내는 보고 있는 학년도만 센다", async () => {
    await service.getMeritStats(admin, "SCHOOL", 2025, NOW);

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ track: "SCHOOL", totalsYear: 2025 }),
    );
  });

  it("기숙사는 입학부터 누적이다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ track: "DORM", totalsYear: null }),
    );
  });

  /**
   * 모집단은 합계 범위가 아니라 **명단 학년도**가 자른다. 기숙사는 누적이라
   * 합계 쪽에 학년도가 아예 없고, 이 값이 빠지면 졸업생의 3년치 벌점이 사감의
   * 명단에 영원히 남는다.
   */
  it("기숙사 누적이어도 명단 학년도를 함께 넘긴다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ totalsYear: null, rosterYear: 2026 }),
    );
  });

  it("지난 학년도를 보면 그 해 명단으로 자른다", async () => {
    await service.getMeritStats(admin, "SCHOOL", 2025, NOW);

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ rosterYear: 2025 }),
    );
  });

  it("반을 골랐으면 그 반 학생만 본다", async () => {
    const students = [
      {
        studentProfileId: "sp-1",
        studentCode: "CODE-sp-1",
        name: "학생1",
        grade: 2,
        classNo: 3,
        number: 1,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
      },
      {
        studentProfileId: "sp-2",
        studentCode: "CODE-sp-2",
        name: "학생2",
        grade: 2,
        classNo: 3,
        number: 2,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
      },
    ];
    listClassRoster.mockResolvedValue([
      ...students,
      {
        ...students[0],
        studentProfileId: "sp-other",
        grade: 1,
        classNo: 1,
      },
    ]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW, {
      grade: 2,
      classNo: 3,
    });

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileIds: ["sp-1", "sp-2"] }),
    );
    expect(stats.classes).toEqual([
      {
        grade: 2,
        classNo: 3,
        students: 2,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
        avgNet: 0,
      },
    ]);
    expect(stats.scope).toEqual({ grade: 2, classNo: 3 });
    expect(stats.students).toEqual(students);
    expect(listClassRoster).toHaveBeenCalledTimes(1);
    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });
    expect(listClassRoster.mock.calls[0][0]).not.toHaveProperty("grade");
    expect(listClassRoster.mock.calls[0][0]).not.toHaveProperty("classNo");
  });

  it("전교로 보면 명단을 한 번 접고 학생 목록 조건은 넘기지 않는다", async () => {
    listClassRoster.mockResolvedValue([
      {
        studentProfileId: "sp-assigned",
        studentCode: "CODE-sp-assigned",
        name: "배정학생",
        grade: 1,
        classNo: 2,
        number: 1,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
      },
      {
        studentProfileId: "sp-unassigned",
        studentCode: "CODE-sp-unassigned",
        name: "미배정학생",
        grade: null,
        classNo: null,
        number: null,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
      },
    ]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(listClassRoster).toHaveBeenCalledTimes(1);
    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });
    expect(stats.students).toBeNull();
    expect(stats.classes).toEqual([
      {
        grade: 1,
        classNo: 2,
        students: 1,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
        avgNet: 0,
      },
    ]);
    expect(demeritTotalsByStudent.mock.calls[0][0].studentProfileIds).toBeUndefined();
  });

  it("소속 조회는 반 편성 학년도 기준이다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", DANGER)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(findStudentsWithClass).toHaveBeenCalledWith(["sp-1"], 2026);
  });
});

describe("기준 초과 명단 — 권한", () => {
  it("학생은 볼 수 없다", async () => {
    await expect(
      service.getMeritStats(
        user("STUDENT", "u-1", { name: "이정민" }),
        "SCHOOL",
        undefined,
        NOW,
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(demeritTotalsByStudent).not.toHaveBeenCalled();
  });

  it("학부모도 볼 수 없다", async () => {
    await expect(
      service.getMeritStats(
        user("PARENT", "u-1", { name: "이정민" }),
        "SCHOOL",
        undefined,
        NOW,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
