import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

/**
 * 기준 초과 학생 명단.
 *
 * **여기서 틀리면 조용히 틀린다.** 명단이 한 명 짧게 나와도 화면은 아무 이상이
 * 없어 보이고, 빠진 사람은 선도위원회 준비에서 그대로 누락된다. 그래서 경계값
 * (기준 정확히 = 포함), 트랙별 집계 범위, 반 범위를 못 박아 둔다.
 *
 * 기준은 관리자가 설정 화면에서 정하는 값이라 **여기서는 목으로 고정한다** —
 * 코드 기본값을 그대로 쓰면 "설정을 읽는가"가 아니라 "상수가 무엇인가"를
 * 검증하게 되고, 학교가 기준을 바꾸는 순간 이 테스트가 의미를 잃는다.
 */

const WARN = 12;
const DANGER = 18;

const getDemeritThresholds = vi.fn();

const trackTotals = vi.fn();
const classSummaries = vi.fn();
const topRules = vi.fn();
const listAwardsForChart = vi.fn();
const listClassRoster = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  trackTotals,
  classSummaries,
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

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: "u-1",
    name: "이정민",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
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
      ? [{ number: 3, schoolClass: { grade: 2, classNo: 3 } }]
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getDemeritThresholds.mockResolvedValue({ warn: WARN, danger: DANGER });
  trackTotals.mockResolvedValue([]);
  classSummaries.mockResolvedValue([]);
  topRules.mockResolvedValue([]);
  listAwardsForChart.mockResolvedValue([]);
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

  it("위험 기준을 넘으면 danger 단계가 붙는다 — 화면이 붉게 칠할 근거다", async () => {
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

  it("설정된 기준 숫자를 화면으로 내보낸다 — 화면이 왜 붉은지 적을 근거다", async () => {
    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);
    expect(stats.thresholds).toEqual({ warn: WARN, danger: DANGER });
  });

  it("기준을 바꾸면 명단이 달라진다 — 이 기능의 존재 이유다", async () => {
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

  it("트랙마다 자기 기준을 읽는다 — 교내와 기숙사가 다를 수 있다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);
    expect(getDemeritThresholds).toHaveBeenCalledWith("DORM");
  });
});

describe("기준 초과 명단 — 순서와 소속", () => {
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

  it("소속이 없어도 명단에 남는다 — 반 미배정 학생이 제일 놓치기 쉽다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", DANGER)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준", false)]);

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.watchList).toHaveLength(1);
    expect(stats.watchList[0].grade).toBeNull();
    expect(stats.watchList[0].classNo).toBeNull();
  });

  it("신원을 못 찾은 합계는 줄을 만들지 않는다 — 이름 없는 줄은 명단이 아니다", async () => {
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

  it("기숙사는 입학부터 누적이다 — 학년도 조건이 붙지 않는다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ track: "DORM", totalsYear: null }),
    );
  });

  it("반을 골랐으면 그 반 학생만 본다 — 화면의 다른 숫자와 범위를 맞춘다", async () => {
    listClassRoster.mockResolvedValue([
      { studentProfileId: "sp-1" },
      { studentProfileId: "sp-2" },
    ]);

    await service.getMeritStats(admin, "SCHOOL", undefined, NOW, {
      grade: 2,
      classNo: 3,
    });

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileIds: ["sp-1", "sp-2"] }),
    );
  });

  it("전교로 보면 학생 목록 조건 없이 부른다", async () => {
    await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(demeritTotalsByStudent.mock.calls[0][0].studentProfileIds).toBeUndefined();
  });

  it("소속 조회는 반 편성 학년도 기준이다 — 기숙사(누적)여도 반은 어느 해 것인지가 필요하다", async () => {
    demeritTotalsByStudent.mockResolvedValue([sum("sp-1", DANGER)]);
    findStudentsWithClass.mockResolvedValue([student("sp-1", "김민준")]);

    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(findStudentsWithClass).toHaveBeenCalledWith(["sp-1"], 2026);
  });
});

describe("기준 초과 명단 — 권한", () => {
  it("학생은 볼 수 없다 — merit:read:any 하나로 막는다 (새 액션을 만들지 않았다)", async () => {
    await expect(
      service.getMeritStats(user("STUDENT"), "SCHOOL", undefined, NOW),
    ).rejects.toThrow("FORBIDDEN");
    expect(demeritTotalsByStudent).not.toHaveBeenCalled();
  });

  it("학부모도 볼 수 없다", async () => {
    await expect(
      service.getMeritStats(user("PARENT"), "SCHOOL", undefined, NOW),
    ).rejects.toThrow("FORBIDDEN");
  });
});
