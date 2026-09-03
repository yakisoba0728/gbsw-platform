import { beforeEach, describe, expect, it, vi } from "vitest";
import { meritKindDelta, meritKindSign } from "@/modules/merit/merit.points";
import { user } from "../../helpers/session";

describe("meritKindDelta — 부호 규칙", () => {
  it("상점과 상쇄점은 +, 벌점은 −", () => {
    expect(meritKindDelta("MERIT")).toBe(1);
    expect(meritKindDelta("OFFSET")).toBe(1);
    expect(meritKindDelta("DEMERIT")).toBe(-1);
  });

  it("모르는 종류는 0", () => {
    expect(meritKindDelta("BONUS")).toBe(0);
    expect(meritKindDelta("")).toBe(0);
  });

  it("화면 부호도 같은 규칙을 따른다", () => {
    expect(meritKindSign("MERIT")).toBe("+");
    expect(meritKindSign("OFFSET")).toBe("+");
    expect(meritKindSign("DEMERIT")).toBe("−");
  });
});

const totals = vi.fn();
const listAwards = vi.fn();
const findStudentProfileByUserId = vi.fn();
const listClassRoster = vi.fn();
const trackTotals = vi.fn();
const awardsByRule = vi.fn();
const listAwardsForChart = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  totals,
  listAwards,
  findStudentProfileByUserId,
  listClassRoster,
  trackTotals,
  awardsByRule,
  listAwardsForChart,
  demeritTotalsByStudent,
  findStudentsWithClass,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
  AcademicYearError: class extends Error {},
}));
vi.mock("@/modules/merit/threshold.service", () => ({
  getDemeritThresholds: vi.fn().mockResolvedValue({ warn: 20, danger: 30 }),
}));

const service = await import("@/modules/merit/award.service");
const statsService = await import("@/modules/merit/stats.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });

const MIXED = [
  { kind: "MERIT", _sum: { points: 10 } },
  { kind: "DEMERIT", _sum: { points: 20 } },
  { kind: "OFFSET", _sum: { points: 6 } },
];

beforeEach(() => {
  totals.mockReset().mockResolvedValue(MIXED);
  listAwards.mockReset().mockResolvedValue([]);
  findStudentProfileByUserId.mockReset().mockResolvedValue({
    id: "sp-1",
    user: { name: "김민준" },
  });
  listClassRoster.mockReset().mockResolvedValue([]);
  demeritTotalsByStudent.mockReset().mockResolvedValue([]);
  findStudentsWithClass.mockReset().mockResolvedValue([]);
  trackTotals
    .mockReset()
    .mockResolvedValue(MIXED.map((r) => ({ ...r, _count: { _all: 1 } })));
  awardsByRule.mockReset().mockResolvedValue({ rows: [], rules: [] });
  listAwardsForChart.mockReset().mockResolvedValue([]);
});

describe("학생 합계", () => {
  it("상쇄점이 순점수를 올린다", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 10, demerit: 20, offset: 6, net: -4 });
  });

  it("상쇄점을 상점에 더하지 않는다", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals.merit).toBe(10);
  });

  it("상쇄점을 벌점으로 접지도 않는다", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals.demerit).toBe(20);
  });

  it("상쇄점이 없으면 0이고 순점수는 예전과 같다", async () => {
    totals.mockResolvedValue([
      { kind: "MERIT", _sum: { points: 10 } },
      { kind: "DEMERIT", _sum: { points: 4 } },
    ]);

    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 10, demerit: 4, offset: 0, net: 6 });
  });

  it("본인 조회도 같은 규칙을 쓴다", async () => {
    const view = await service.getMyMerit(admin, "SCHOOL");

    expect(view.totals.offset).toBe(6);
    expect(view.totals.net).toBe(-4);
  });
});

describe("통계 합계", () => {
  it("트랙 전체 합계에도 상쇄점이 들어간다", async () => {
    const stats = await statsService.getMeritStats(admin, "SCHOOL");

    expect(stats.totals.merit).toBe(10);
    expect(stats.totals.demerit).toBe(20);
    expect(stats.totals.offset).toBe(6);
    expect(stats.totals.net).toBe(-4);
  });

  it("부여 건수는 종류와 무관하게 전부 센다", async () => {
    const stats = await statsService.getMeritStats(admin, "SCHOOL");

    expect(stats.totals.awardCount).toBe(3);
  });
});
