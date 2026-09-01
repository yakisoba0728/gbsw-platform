import { beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "../../helpers/session";

/**
 * 순위 · 현황. 등수는 화면이 매기지 않고 서비스가 붙여 보내므로, 동점 처리와
 * 정렬 기준이 여기서만 확인된다 — 표는 서비스가 준 순서를 그대로 그린다.
 */

const listClassRoster = vi.fn();
// 같은 모듈의 나머지 export — 팩토리에 없으면 undefined가 되어 다른 서비스가 깨진다.
const trackTotals = vi.fn();
const trackTotalsBetween = vi.fn();
const topRules = vi.fn();
const listAwardsForChart = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  listClassRoster,
  trackTotals,
  trackTotalsBetween,
  topRules,
  listAwardsForChart,
  demeritTotalsByStudent,
  findStudentsWithClass,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
const getCurrentYear = vi.fn();
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear,
  AcademicYearError: class extends Error {},
}));
// 기준은 이 파일이 검증하는 대상이 아니다 — 목으로 고정해 두어야 학교가 기준을
// 바꿔도 여기 테스트가 흔들리지 않는다 (merit.watch-list.test.ts가 그쪽을 본다).
vi.mock("@/modules/merit/threshold.service", () => ({
  getDemeritThresholds: vi.fn().mockResolvedValue({ warn: 20, danger: 30 }),
}));

const service = await import("@/modules/merit/stats.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });
const student = user("STUDENT", "u-1", { name: "이정민" });

/** listClassRoster가 내는 학생별 합계 한 줄. */
function total(
  id: string,
  name: string,
  net: number,
  over: {
    demerit?: number;
    grade?: number | null;
    classNo?: number | null;
    number?: number | null;
  } = {},
) {
  return {
    studentProfileId: id,
    studentCode: `CODE-${id}`,
    name,
    grade: over.grade === undefined ? 2 : over.grade,
    classNo: over.classNo === undefined ? 3 : over.classNo,
    number: over.number === undefined ? 1 : over.number,
    merit: net > 0 ? net : 0,
    demerit: over.demerit ?? (net < 0 ? -net : 0),
    offset: 0,
    net,
  };
}

/** 한 반 명단 줄을 번호만 간단히 달리 만든다. */
function rosterRow(id: string, number: number, net: number, demerit?: number) {
  return total(id, `학생${number}`, net, {
    grade: 2,
    classNo: 3,
    number,
    demerit,
  });
}

function mockRoster(rows: unknown[] = []) {
  listClassRoster.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentYear.mockResolvedValue(2026);
  mockRoster();
});

describe("getRankingStats — 권한", () => {
  it("학생은 볼 수 없고, 거부되면 조회도 하지 않는다", async () => {
    await expect(service.getRankingStats(student, "SCHOOL")).rejects.toThrow(
      "FORBIDDEN",
    );

    expect(listClassRoster).not.toHaveBeenCalled();
  });
});

describe("getRankingStats — 전교 학생 순위", () => {
  it("동점은 같은 등수고, 다음 등수는 인원만큼 건너뛴다", async () => {
    // 순점수 10점이 셋이면 1·1·1등이고 그 다음은 2등이 아니라 4등이다.
    mockRoster([
      total("sp-d", "라학생", 5),
      total("sp-a", "가학생", 10),
      total("sp-c", "다학생", 10),
      total("sp-b", "나학생", 10),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    // 동점 안에서는 이름순이다 — 순서가 호출마다 바뀌면 같은 표를 다시 열 때
    // 줄이 뒤바뀐다.
    expect(stats.students.map((s) => [s.name, s.rank])).toEqual([
      ["가학생", 1],
      ["나학생", 1],
      ["다학생", 1],
      ["라학생", 4],
    ]);
  });

  it("벌점 단계를 줄마다 붙인다 — 표가 기준을 다시 계산하지 않는다", async () => {
    mockRoster([
      total("sp-1", "가학생", -30, { demerit: 30 }),
      total("sp-2", "나학생", -20, { demerit: 20 }),
      total("sp-3", "다학생", -1, { demerit: 1 }),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.students.map((s) => s.level)).toEqual(["none", "warn", "danger"]);
  });

  it("전교 명단을 범위 없이 한 번만 읽는다", async () => {
    await service.getRankingStats(admin, "SCHOOL");

    expect(listClassRoster).toHaveBeenCalledTimes(1);
    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });
  });

  it("반 미배정 학생은 학생 순위에는 남고 반 순위에서만 빠진다", async () => {
    mockRoster([
      total("sp-assigned", "배정학생", 1, { grade: 1, classNo: 2 }),
      total("sp-unassigned", "미배정학생", 2, {
        grade: null,
        classNo: null,
        number: null,
      }),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.students.map((row) => row.studentProfileId)).toEqual([
      "sp-unassigned",
      "sp-assigned",
    ]);
    expect(stats.classes.map((row) => `${row.grade}-${row.classNo}`)).toEqual(["1-2"]);
  });
});

describe("getRankingStats — 반을 고른 경우", () => {
  const scope = { grade: 2, classNo: 3 };

  it("전교 명단에서 고른 반만 남기고 번호순·등수 없음으로 낸다", async () => {
    // repo가 학년·반·번호순으로 준다. 점수 순으로 다시 세우면 담임이 찾는 줄이 옮겨 간다.
    mockRoster([
      total("other", "다른반", 20, { grade: 1, classNo: 1 }),
      rosterRow("sp-1", 1, -5),
      rosterRow("sp-2", 2, 12),
      rosterRow("sp-3", 3, 0),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, scope);

    expect(stats.students.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(stats.students.map((s) => s.rank)).toEqual([0, 0, 0]);
    expect(stats.students.map((s) => s.studentProfileId)).toEqual([
      "sp-1",
      "sp-2",
      "sp-3",
    ]);
  });

  it("scope를 DB에 넘기지 않고 전교 명단을 정확히 한 번 읽는다", async () => {
    mockRoster([
      total("other", "다른반", 1, { grade: 1, classNo: 1 }),
      rosterRow("sp-1", 1, 3),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, scope);

    expect(stats.scope).toEqual(scope);
    expect(stats.students[0]).toMatchObject({ grade: 2, classNo: 3 });
    expect(listClassRoster).toHaveBeenCalledTimes(1);
    expect(listClassRoster).toHaveBeenCalledWith({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });
    expect(listClassRoster.mock.calls[0][0]).not.toHaveProperty("grade");
    expect(listClassRoster.mock.calls[0][0]).not.toHaveProperty("classNo");
  });
});

describe("getRankingStats — 반 순위", () => {
  it("합계가 아니라 1인 평균 순점수 내림차순이다", async () => {
    // 1-1은 합계 10점이지만 2명이어서 평균 5점, 2-3은 1명이어서 평균 6점이다.
    mockRoster([
      total("sp-11a", "가학생", 10, { grade: 1, classNo: 1, number: 1 }),
      total("sp-11b", "나학생", 0, { grade: 1, classNo: 1, number: 2 }),
      total("sp-23", "다학생", 6, { grade: 2, classNo: 3 }),
      total("sp-32", "라학생", 1, { grade: 3, classNo: 2 }),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.classes.map((c) => [`${c.grade}-${c.classNo}`, c.rank])).toEqual([
      ["2-3", 1],
      ["1-1", 2],
      ["3-2", 3],
    ]);
  });

  it("평균이 같은 반은 같은 등수고, 다음 등수는 건너뛴다", async () => {
    mockRoster([
      total("sp-11", "가학생", 3, { grade: 1, classNo: 1 }),
      total("sp-12", "나학생", 3, { grade: 1, classNo: 2 }),
      total("sp-13", "다학생", 1, { grade: 1, classNo: 3 }),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.classes.map((c) => [`${c.grade}-${c.classNo}`, c.rank])).toEqual([
      ["1-1", 1],
      ["1-2", 1],
      ["1-3", 3],
    ]);
  });

  it("반을 골라도 반 순위는 전교 그대로다 — 고른 반의 자리를 알아야 한다", async () => {
    mockRoster([
      total("sp-11", "가학생", 3, { grade: 1, classNo: 1 }),
      total("sp-23", "나학생", 1, { grade: 2, classNo: 3 }),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, {
      grade: 2,
      classNo: 3,
    });

    expect(stats.students.map((row) => row.studentProfileId)).toEqual(["sp-23"]);
    expect(stats.classes.map((c) => [`${c.grade}-${c.classNo}`, c.rank])).toEqual([
      ["1-1", 1],
      ["2-3", 2],
    ]);
  });
});

describe("getRankingStats — 집계 범위", () => {
  it("교내는 그 학년도, 기숙사는 누적이고 반 편성은 언제나 학년도 기준이다", async () => {
    await service.getRankingStats(admin, "SCHOOL");
    expect(listClassRoster.mock.calls[0][0]).toEqual({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    await service.getRankingStats(admin, "DORM");
    expect(listClassRoster.mock.calls[1][0]).toEqual({
      year: 2026,
      track: "DORM",
      // 기숙사 점수는 입학부터 누적이다. 반 편성만 학년도를 본다.
      totalsYear: null,
    });
  });

  it("지난 학년도를 고르면 합계도 반 편성도 그 해를 본다", async () => {
    const stats = await service.getRankingStats(admin, "SCHOOL", 2025);

    expect(stats.year).toBe(2025);
    expect(stats.rosterYear).toBe(2025);
    expect(listClassRoster.mock.calls[0][0]).toEqual({
      year: 2025,
      track: "SCHOOL",
      totalsYear: 2025,
    });
  });
});
