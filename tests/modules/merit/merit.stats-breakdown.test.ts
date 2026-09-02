import { beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "../../helpers/session";

/**
 * 교사별·규정별 집계. 두 화면 모두 "누가/무엇이 얼마나"를 세는데, 계정이 지워지거나
 * 규정이 지워진 뒤에도 기록은 남는다 — 그 뒤처리를 못 박는다.
 */

const teacherTotals = vi.fn();
const findUserNames = vi.fn();
const awardsByRule = vi.fn();
const unusedRules = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  teacherTotals,
  findUserNames,
  awardsByRule,
  unusedRules,
  // 같은 모듈의 나머지 export — 팩토리에 없으면 undefined가 되어 다른 서비스가 깨진다.
  trackTotals: vi.fn(),
  trackTotalsBetween: vi.fn(),
  listAwardsForChart: vi.fn(),
  listClassRoster: vi.fn(),
  demeritTotalsByStudent: vi.fn(),
  findStudentsWithClass: vi.fn(),
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
  AcademicYearError: class extends Error {},
}));
vi.mock("@/modules/merit/threshold.service", () => ({
  getDemeritThresholds: vi.fn().mockResolvedValue({ warn: 20, danger: 30 }),
}));

const service = await import("@/modules/merit/stats.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });
const student = user("STUDENT", "u-1", { name: "이정민" });

function group(kind: string, count: number, points: number) {
  return { kind, _count: { _all: count }, _sum: { points } };
}

beforeEach(() => {
  vi.clearAllMocks();
  teacherTotals.mockResolvedValue({ byUser: [], byName: [] });
  findUserNames.mockResolvedValue([]);
  awardsByRule.mockResolvedValue({ rows: [], rules: [] });
  unusedRules.mockResolvedValue([]);
});

describe("getTeacherStats", () => {
  it("권한이 없으면 거부하고 조회하지 않는다", async () => {
    await expect(service.getTeacherStats(student, "SCHOOL")).rejects.toThrow();
    expect(teacherTotals).not.toHaveBeenCalled();
  });

  it("합계 학년도와 별개로 기본·과거·기숙사 명단 학년도를 넘긴다", async () => {
    await service.getTeacherStats(admin, "SCHOOL");
    await service.getTeacherStats(admin, "SCHOOL", 2025);
    await service.getTeacherStats(admin, "DORM");
    await service.getTeacherStats(admin, "DORM", 2025);

    expect(teacherTotals.mock.calls.map((call) => call[0])).toEqual([
      { track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 },
      { track: "SCHOOL", totalsYear: 2025, rosterYear: 2025 },
      { track: "DORM", totalsYear: null, rosterYear: 2026 },
      { track: "DORM", totalsYear: null, rosterYear: 2025 },
    ]);
  });

  it("한 사람의 여러 종류를 한 줄로 접는다", async () => {
    teacherTotals.mockResolvedValue({
      byUser: [
        { awardedByUserId: "t-1", ...group("MERIT", 4, 12) },
        { awardedByUserId: "t-1", ...group("DEMERIT", 3, 9) },
      ],
      byName: [],
    });
    findUserNames.mockResolvedValue([{ id: "t-1", name: "김선생" }]);

    const { rows } = await service.getTeacherStats(admin, "SCHOOL");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "t-1", name: "김선생", removed: false, awardCount: 7 });
    expect(rows[0].totals.merit).toBe(12);
    expect(rows[0].totals.demerit).toBe(9);
    expect(rows[0].totals.net).toBe(3);
  });

  it("지금 이름을 쓴다 — 스냅샷은 개명 전 이름일 수 있다", async () => {
    teacherTotals.mockResolvedValue({
      byUser: [{ awardedByUserId: "t-1", ...group("MERIT", 1, 5) }],
      byName: [],
    });
    findUserNames.mockResolvedValue([{ id: "t-1", name: "새이름" }]);

    const { rows } = await service.getTeacherStats(admin, "SCHOOL");
    expect(rows[0].name).toBe("새이름");
  });

  it("계정이 지워진 부여자는 이름 스냅샷으로 따로 선다", async () => {
    teacherTotals.mockResolvedValue({
      byUser: [{ awardedByUserId: "t-1", ...group("MERIT", 1, 5) }],
      byName: [
        { awardedByName: "떠난선생", ...group("DEMERIT", 2, 6) },
        { awardedByName: "또다른선생", ...group("MERIT", 1, 3) },
      ],
    });
    findUserNames.mockResolvedValue([{ id: "t-1", name: "김선생" }]);

    const { rows, teacherCount } = await service.getTeacherStats(admin, "SCHOOL");

    // 삭제된 계정끼리 한 덩어리로 뭉치면 안 된다 — 이름별로 나뉜다.
    expect(teacherCount).toBe(3);
    expect(rows.filter((r) => r.removed).map((r) => r.name).sort()).toEqual(
      ["또다른선생", "떠난선생"].sort(),
    );
    expect(rows.filter((r) => r.removed).every((r) => r.userId === null)).toBe(true);
  });

  it("건수 많은 순, 같으면 이름순이다", async () => {
    teacherTotals.mockResolvedValue({
      byUser: [
        { awardedByUserId: "a", ...group("MERIT", 1, 1) },
        { awardedByUserId: "b", ...group("MERIT", 9, 9) },
        { awardedByUserId: "c", ...group("MERIT", 1, 1) },
      ],
      byName: [],
    });
    findUserNames.mockResolvedValue([
      { id: "a", name: "나선생" },
      { id: "b", name: "다선생" },
      { id: "c", name: "가선생" },
    ]);

    const { rows } = await service.getTeacherStats(admin, "SCHOOL");
    expect(rows.map((r) => r.name)).toEqual(["다선생", "가선생", "나선생"]);
  });
});

describe("getRuleStats", () => {
  it("권한이 없으면 거부하고 조회하지 않는다", async () => {
    await expect(service.getRuleStats(student, "SCHOOL")).rejects.toThrow();
    expect(awardsByRule).not.toHaveBeenCalled();
  });

  it("합계 학년도와 별개로 기본·과거·기숙사 명단 학년도를 넘긴다", async () => {
    await service.getRuleStats(admin, "SCHOOL");
    await service.getRuleStats(admin, "SCHOOL", 2025);
    await service.getRuleStats(admin, "DORM");
    await service.getRuleStats(admin, "DORM", 2025);

    expect(awardsByRule.mock.calls.map((call) => call[0])).toEqual([
      { track: "SCHOOL", totalsYear: 2026, rosterYear: 2026 },
      { track: "SCHOOL", totalsYear: 2025, rosterYear: 2025 },
      { track: "DORM", totalsYear: null, rosterYear: 2026 },
      { track: "DORM", totalsYear: null, rosterYear: 2025 },
    ]);
  });

  it("분류를 규정에서 붙이고, 지워진 규정도 표시해 낸다", async () => {
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-1",
          label: "옛 지각",
          kind: "DEMERIT",
          _count: { _all: 5 },
          _sum: { points: 10 },
        },
        {
          ruleId: "r-2",
          label: "옛 봉사",
          kind: "MERIT",
          _count: { _all: 2 },
          _sum: { points: 4 },
        },
      ],
      rules: [
        { id: "r-1", label: "등교 지각", category: "생활", active: true },
        // 규정 관리에서 지웠지만 이미 나간 기록은 남는다.
        { id: "r-2", label: "봉사", category: "봉사", active: false },
      ],
    });

    const { rows, totalCount } = await service.getRuleStats(admin, "SCHOOL");

    expect(totalCount).toBe(7);
    expect(rows[0]).toMatchObject({
      label: "등교 지각",
      category: "생활",
      deleted: false,
      count: 5,
    });
    expect(rows[1]).toMatchObject({
      label: "봉사",
      category: "봉사",
      deleted: true,
      count: 2,
    });
  });

  it("이름이 바뀐 규정을 한 줄로 접고 건수를 합친다", async () => {
    // 부여 기록의 label은 부여 시점 스냅샷이라, 규정 이름을 고친 뒤 다시 부여하면
    // 같은 ruleId가 이름별로 나뉜 채 온다. 접지 않으면 화면이 ruleId를 막대 폭과
    // 행 key로 쓰므로 뒤 줄이 앞 줄을 덮고, 「쓰인 규정」이 규정 수를 세지 않는다.
    awardsByRule.mockResolvedValue({
      rows: [
        { ruleId: "r-1", label: "지각", kind: "DEMERIT", _count: { _all: 5 }, _sum: { points: 10 } },
        {
          ruleId: "r-1",
          label: "등교 지각",
          kind: "DEMERIT",
          _count: { _all: 2 },
          _sum: { points: 4 },
        },
      ],
      // 규정 이름은 이미 "등교 지각"으로 고쳐졌다. 기록에 박힌 "지각"은 옛 스냅샷이다.
      rules: [{ id: "r-1", label: "등교 지각", category: "생활", active: true }],
    });

    const { rows, totalCount } = await service.getRuleStats(admin, "SCHOOL");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ruleId: "r-1", count: 7, points: 14, kind: "DEMERIT" });
    // 이름은 규정의 **현재** 이름이다 — 건수가 더 많다는 이유로 옛 이름("지각")을
    // 남기면 방금 이름을 고친 사람이 자기가 고친 항목을 못 찾는다.
    expect(rows[0].label).toBe("등교 지각");
    expect(totalCount).toBe(7);
  });

  it("현재 규정을 찾지 못하면 스냅샷 이름과 빈 분류로 남긴다", async () => {
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-gone",
          label: "남은 스냅샷",
          kind: "DEMERIT",
          _count: { _all: 3 },
          _sum: { points: 6 },
        },
      ],
      rules: [],
    });

    const { rows } = await service.getRuleStats(admin, "SCHOOL");

    expect(rows).toEqual([
      {
        ruleId: "r-gone",
        label: "남은 스냅샷",
        kind: "DEMERIT",
        category: null,
        deleted: false,
        count: 3,
        points: 6,
      },
    ]);
  });

  it("한 번도 안 쓰인 규정을 함께 낸다 — 규정표를 다듬는 자료다", async () => {
    unusedRules.mockResolvedValue([
      { id: "r-9", kind: "MERIT", label: "안 쓰는 항목", points: 1, category: null },
    ]);

    const { unused } = await service.getRuleStats(admin, "SCHOOL");
    expect(unused).toHaveLength(1);
    // unusedRules는 「재학생이 안 쓴 규정」이 아니라 「아무도 안 쓴 규정」을 찾는다.
    // 모집단 통일 뒤에도 rosterYear를 넘기지 않는다.
    expect(unusedRules).toHaveBeenCalledWith({ track: "SCHOOL", totalsYear: 2026 });
  });
});
