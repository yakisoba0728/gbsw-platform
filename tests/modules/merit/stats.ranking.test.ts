import { beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "../../helpers/session";

/**
 * 순위 · 현황. 등수는 화면이 매기지 않고 서비스가 붙여 보내므로, 동점 처리와
 * 정렬 기준이 여기서만 확인된다 — 표는 서비스가 준 순서를 그대로 그린다.
 */

const classSummaries = vi.fn();
const listClassRoster = vi.fn();
// 같은 모듈의 나머지 export — 팩토리에 없으면 undefined가 되어 다른 서비스가 깨진다.
const trackTotals = vi.fn();
const trackTotalsBetween = vi.fn();
const topRules = vi.fn();
const listAwardsForChart = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  classSummaries,
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

/** 전교 조회(범위 없음)가 내는 모양. 순점수만 다르게 준다. */
function total(
  id: string,
  name: string,
  net: number,
  over: { demerit?: number; grade?: number | null; classNo?: number | null } = {},
) {
  return {
    studentProfileId: id,
    studentCode: `CODE-${id}`,
    name,
    grade: over.grade ?? 2,
    classNo: over.classNo ?? 3,
    number: 1,
    merit: net > 0 ? net : 0,
    demerit: over.demerit ?? 0,
    offset: 0,
    net,
  };
}

/** 반을 좁힌 조회가 내는 모양. 같은 repo 함수라 학급 칸도 함께 온다. */
function rosterRow(id: string, number: number, net: number, demerit = 0) {
  return {
    studentProfileId: id,
    studentCode: `CODE-${id}`,
    name: `학생${number}`,
    grade: 2,
    classNo: 3,
    number,
    merit: net > 0 ? net : 0,
    demerit,
    offset: 0,
    net,
  };
}

/** repo.classSummaries가 내는 모양. */
function classRow(grade: number, classNo: number, avgNet: number) {
  return {
    grade,
    classNo,
    students: 20,
    merit: 0,
    demerit: 0,
    offset: 0,
    net: avgNet * 20,
    avgNet,
  };
}

/**
 * 전교와 한 반을 같은 repo 함수가 낸다 — 범위(grade)를 줬는지로 갈린다.
 * 그래서 목도 인자를 보고 갈라야 한다.
 */
function mockRoster(sets: { all?: unknown[]; scoped?: unknown[] } = {}) {
  listClassRoster.mockImplementation((params: { grade?: number }) =>
    Promise.resolve(params.grade === undefined ? (sets.all ?? []) : (sets.scoped ?? [])),
  );
}

/** 범위 없이(전교로) 부른 호출들. */
const allCalls = () =>
  listClassRoster.mock.calls.filter((c) => c[0].grade === undefined);
/** 반을 좁혀 부른 호출들. */
const scopedCalls = () =>
  listClassRoster.mock.calls.filter((c) => c[0].grade !== undefined);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentYear.mockResolvedValue(2026);
  classSummaries.mockResolvedValue([]);
  mockRoster();
});

describe("getRankingStats — 권한", () => {
  it("학생은 볼 수 없고, 거부되면 조회도 하지 않는다", async () => {
    await expect(service.getRankingStats(student, "SCHOOL")).rejects.toThrow(
      "FORBIDDEN",
    );

    expect(listClassRoster).not.toHaveBeenCalled();
    expect(classSummaries).not.toHaveBeenCalled();
  });
});

describe("getRankingStats — 전교 학생 순위", () => {
  it("동점은 같은 등수고, 다음 등수는 인원만큼 건너뛴다", async () => {
    // 순점수 10점이 셋이면 1·1·1등이고 그 다음은 2등이 아니라 4등이다.
    mockRoster({ all: [
      total("sp-d", "라학생", 5),
      total("sp-a", "가학생", 10),
      total("sp-c", "다학생", 10),
      total("sp-b", "나학생", 10),
    ] });

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
    mockRoster({ all: [
      total("sp-1", "가학생", -30, { demerit: 30 }),
      total("sp-2", "나학생", -20, { demerit: 20 }),
      total("sp-3", "다학생", -1, { demerit: 1 }),
    ] });

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.students.map((s) => s.level)).toEqual(["none", "warn", "danger"]);
  });

  it("반을 안 고르면 반 명단 조회를 하지 않는다", async () => {
    await service.getRankingStats(admin, "SCHOOL");

    expect(allCalls()).toHaveLength(1);
    expect(scopedCalls()).toHaveLength(0);
  });
});

describe("getRankingStats — 반을 고른 경우", () => {
  const scope = { grade: 2, classNo: 3 };

  it("등수를 붙이지 않고 repo가 준 번호순을 지킨다", async () => {
    // repo가 번호순으로 준다. 점수 순으로 다시 세우면 담임이 찾는 줄이 옮겨 간다.
    mockRoster({ scoped: [
      rosterRow("sp-1", 1, -5),
      rosterRow("sp-2", 2, 12),
      rosterRow("sp-3", 3, 0),
    ] });

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, scope);

    expect(stats.students.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(stats.students.map((s) => s.rank)).toEqual([0, 0, 0]);
  });

  it("고른 반을 그대로 소속으로 붙이고 전교 조회는 하지 않는다", async () => {
    mockRoster({ scoped: [rosterRow("sp-1", 1, 3)] });

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, scope);

    expect(stats.scope).toEqual(scope);
    expect(stats.students[0]).toMatchObject({ grade: 2, classNo: 3 });
    expect(allCalls()).toHaveLength(0);
    expect(scopedCalls()[0][0]).toMatchObject({
      year: 2026,
      grade: 2,
      classNo: 3,
      track: "SCHOOL",
      totalsYear: 2026,
    });
  });
});

describe("getRankingStats — 반 순위", () => {
  it("1인 평균 순점수 내림차순이다 — 합계로 세우면 큰 반이 불리하다", async () => {
    classSummaries.mockResolvedValue([
      classRow(1, 1, -2.5),
      classRow(2, 3, 4.5),
      classRow(3, 2, 0.5),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.classes.map((c) => [`${c.grade}-${c.classNo}`, c.rank])).toEqual([
      ["2-3", 1],
      ["3-2", 2],
      ["1-1", 3],
    ]);
  });

  it("평균이 같은 반은 같은 등수고, 다음 등수는 건너뛴다", async () => {
    classSummaries.mockResolvedValue([
      classRow(1, 1, 3),
      classRow(1, 2, 3),
      classRow(1, 3, 1),
    ]);

    const stats = await service.getRankingStats(admin, "SCHOOL");

    expect(stats.classes.map((c) => c.rank)).toEqual([1, 1, 3]);
  });

  it("반을 골라도 반 순위는 전교 그대로다 — 고른 반의 자리를 알아야 한다", async () => {
    classSummaries.mockResolvedValue([classRow(1, 1, 3), classRow(2, 3, 1)]);

    const stats = await service.getRankingStats(admin, "SCHOOL", undefined, {
      grade: 2,
      classNo: 3,
    });

    expect(stats.classes).toHaveLength(2);
  });
});

describe("getRankingStats — 집계 범위", () => {
  it("교내는 그 학년도, 기숙사는 누적이고 반 편성은 언제나 학년도 기준이다", async () => {
    await service.getRankingStats(admin, "SCHOOL");
    expect(allCalls()[0][0]).toEqual({
      year: 2026,
      track: "SCHOOL",
      totalsYear: 2026,
    });

    await service.getRankingStats(admin, "DORM");
    expect(allCalls()[1][0]).toEqual({
      year: 2026,
      track: "DORM",
      // 기숙사 점수는 입학부터 누적이다. 반 편성만 학년도를 본다.
      totalsYear: null,
    });
    expect(classSummaries.mock.calls[1][0].year).toBe(2026);
  });

  it("지난 학년도를 고르면 합계도 반 편성도 그 해를 본다", async () => {
    const stats = await service.getRankingStats(admin, "SCHOOL", 2025);

    expect(stats.year).toBe(2025);
    expect(stats.rosterYear).toBe(2025);
    expect(allCalls()[0][0]).toEqual({
      year: 2025,
      track: "SCHOOL",
      totalsYear: 2025,
    });
  });
});
