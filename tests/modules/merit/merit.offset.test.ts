import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { meritKindDelta, meritKindSign } from "@/core/authz/merit-track";

/**
 * 상쇄점(OFFSET)이 합계에 실제로 반영되는지 확인한다.
 *
 * **이 모듈에서 가장 조용한 실패가 여기다.** 집계 코드가 `if MERIT / else if
 * DEMERIT` 꼴이라, 종류를 하나 더 만들고 집계를 안 고치면 상쇄점이 어디에도
 * 안 더해진다 — 내역에는 60점이 찍혀 있는데 순점수는 꿈쩍도 안 하고,
 * 화면도 테스트도 아무 말을 하지 않는다.
 *
 *   순점수 = 상점 + 상쇄점 − 벌점
 */

describe("meritKindDelta — 부호 규칙", () => {
  it("상점과 상쇄점은 +, 벌점은 −", () => {
    expect(meritKindDelta("MERIT")).toBe(1);
    expect(meritKindDelta("OFFSET")).toBe(1);
    expect(meritKindDelta("DEMERIT")).toBe(-1);
  });

  it("모르는 종류는 0 — 조용히 틀리느니 안 센다", () => {
    expect(meritKindDelta("BONUS")).toBe(0);
    expect(meritKindDelta("")).toBe(0);
  });

  it("화면 부호도 같은 규칙을 따른다", () => {
    expect(meritKindSign("MERIT")).toBe("+");
    expect(meritKindSign("OFFSET")).toBe("+");
    expect(meritKindSign("DEMERIT")).toBe("−");
  });
});

// ── 서비스 집계 ────────────────────────────────────────────────

const totals = vi.fn();
const listAwards = vi.fn();
const findStudentProfileByUserId = vi.fn();
const listClassRoster = vi.fn();
const classSummaries = vi.fn();
const trackTotals = vi.fn();
const topRules = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  totals,
  listAwards,
  findStudentProfileByUserId,
  listClassRoster,
  classSummaries,
  trackTotals,
  topRules,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
  AcademicYearError: class extends Error {},
}));

const service = await import("@/modules/merit/award.service");

const admin: SessionUser = {
  id: "admin-1",
  name: "이정민",
  email: "t@gbsw.hs.kr",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

/** 상점 10 · 벌점 20 · 상쇄 6 → 순점수 −4 */
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
  classSummaries.mockReset().mockResolvedValue([]);
  trackTotals
    .mockReset()
    .mockResolvedValue(MIXED.map((r) => ({ ...r, _count: { _all: 1 } })));
  topRules.mockReset().mockResolvedValue([]);
});

describe("학생 합계", () => {
  it("상쇄점이 순점수를 올린다 — 상점 10 + 상쇄 6 − 벌점 20 = −4", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    expect(view.totals).toEqual({ merit: 10, demerit: 20, offset: 6, net: -4 });
  });

  it("상쇄점을 상점에 더하지 않는다 — 상점 칸은 10 그대로다", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    // 상쇄점을 상점으로 접었다면 여기가 16이 된다. 표창 기준이 흔들리는 지점이다.
    expect(view.totals.merit).toBe(10);
  });

  it("상쇄점을 벌점으로 접지도 않는다 — 벌점 칸은 20 그대로다", async () => {
    const view = await service.getStudentMerit(admin, "sp-1", "SCHOOL");

    // 이진 분기(`kind === "MERIT" ? … : 벌점`)를 그대로 뒀다면 여기가 26이 된다.
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
    const stats = await service.getMeritStats(admin, "SCHOOL");

    expect(stats.totals.merit).toBe(10);
    expect(stats.totals.demerit).toBe(20);
    expect(stats.totals.offset).toBe(6);
    expect(stats.totals.net).toBe(-4);
  });

  it("부여 건수는 종류와 무관하게 전부 센다", async () => {
    const stats = await service.getMeritStats(admin, "SCHOOL");

    expect(stats.totals.awardCount).toBe(3);
  });
});
