import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

/**
 * 교사별·규정별 집계. 두 화면 모두 "누가/무엇이 얼마나"를 세는데, 계정이 지워지거나
 * 규정이 지워진 뒤에도 기록은 남는다 — 그 뒤처리를 못 박는다.
 */

const teacherTotals = vi.fn();
const findUserNames = vi.fn();
const ruleStats = vi.fn();
const unusedRules = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  teacherTotals,
  findUserNames,
  ruleStats,
  unusedRules,
  // 같은 모듈의 나머지 export — 팩토리에 없으면 undefined가 되어 다른 서비스가 깨진다.
  trackTotals: vi.fn(),
  trackTotalsBetween: vi.fn(),
  classSummaries: vi.fn(),
  topRules: vi.fn(),
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

const admin: SessionUser = {
  id: "admin-1",
  name: "이정민",
  email: "t@gbsw.hs.kr",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};
const student: SessionUser = { ...admin, id: "u-1", role: "STUDENT" };

function group(kind: string, count: number, points: number) {
  return { kind, _count: { _all: count }, _sum: { points } };
}

beforeEach(() => {
  vi.clearAllMocks();
  teacherTotals.mockResolvedValue({ byUser: [], byName: [] });
  findUserNames.mockResolvedValue([]);
  ruleStats.mockResolvedValue({ rows: [], rules: [] });
  unusedRules.mockResolvedValue([]);
});

describe("getTeacherStats", () => {
  it("권한이 없으면 거부하고 조회하지 않는다", async () => {
    await expect(service.getTeacherStats(student, "SCHOOL")).rejects.toThrow();
    expect(teacherTotals).not.toHaveBeenCalled();
  });

  it("트랙 규칙을 그대로 따른다 — 교내는 학년도, 기숙사는 누적", async () => {
    await service.getTeacherStats(admin, "SCHOOL");
    expect(teacherTotals.mock.calls[0][0].totalsYear).toBe(2026);

    await service.getTeacherStats(admin, "DORM");
    expect(teacherTotals.mock.calls[1][0].totalsYear).toBeNull();
  });

  it("한 사람의 여러 종류를 한 줄로 접는다", async () => {
    teacherTotals.mockResolvedValue({
      byUser: [
        { awardedByUserId: "t-1", ...group("MERIT", 4, 12) },
        { awardedByUserId: "t-1", ...group("DEMERIT", 3, 9) },
      ],
      byName: [],
    });
    findUserNames.mockResolvedValue([{ id: "t-1", name: "김선생", email: "", deletedAt: null }]);

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
    findUserNames.mockResolvedValue([{ id: "t-1", name: "새이름", email: "", deletedAt: null }]);

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
    findUserNames.mockResolvedValue([{ id: "t-1", name: "김선생", email: "", deletedAt: null }]);

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
      { id: "a", name: "나선생", email: "", deletedAt: null },
      { id: "b", name: "다선생", email: "", deletedAt: null },
      { id: "c", name: "가선생", email: "", deletedAt: null },
    ]);

    const { rows } = await service.getTeacherStats(admin, "SCHOOL");
    expect(rows.map((r) => r.name)).toEqual(["다선생", "가선생", "나선생"]);
  });
});

describe("getRuleStats", () => {
  it("권한이 없으면 거부하고 조회하지 않는다", async () => {
    await expect(service.getRuleStats(student, "SCHOOL")).rejects.toThrow();
    expect(ruleStats).not.toHaveBeenCalled();
  });

  it("분류를 규정에서 붙이고, 지워진 규정도 표시해 낸다", async () => {
    ruleStats.mockResolvedValue({
      rows: [
        { ruleId: "r-1", label: "지각", kind: "DEMERIT", _count: { _all: 5 }, _sum: { points: 10 } },
        { ruleId: "r-2", label: "봉사", kind: "MERIT", _count: { _all: 2 }, _sum: { points: 4 } },
      ],
      rules: [
        { id: "r-1", category: "생활", active: true },
        // 규정 관리에서 지웠지만 이미 나간 기록은 남는다.
        { id: "r-2", category: null, active: false },
      ],
    });

    const { rows, totalCount } = await service.getRuleStats(admin, "SCHOOL");

    expect(totalCount).toBe(7);
    expect(rows[0]).toMatchObject({ label: "지각", category: "생활", deleted: false, count: 5 });
    expect(rows[1]).toMatchObject({ label: "봉사", category: null, deleted: true, count: 2 });
  });

  it("한 번도 안 쓰인 규정을 함께 낸다 — 규정표를 다듬는 자료다", async () => {
    unusedRules.mockResolvedValue([
      { id: "r-9", kind: "MERIT", label: "안 쓰는 항목", points: 1, category: null },
    ]);

    const { unused } = await service.getRuleStats(admin, "SCHOOL");
    expect(unused).toHaveLength(1);
    expect(unusedRules.mock.calls[0][0]).toMatchObject({ track: "SCHOOL", totalsYear: 2026 });
  });
});
