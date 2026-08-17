import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

/**
 * 통계 화면의 범위 비대칭을 못 박는다 — 기숙사는 합계가 누적인데 그래프만
 * 최근 12개월이다. 기록이 12개월을 넘기기 전까지 두 범위가 우연히 같아
 * 화면으로는 확인되지 않는다.
 */

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
// 기준은 이 파일이 검증하는 대상이 아니다 — 목으로 고정해 두어야 학교가 기준을
// 바꿔도 여기 테스트가 흔들리지 않는다 (merit.watch-list.test.ts가 그쪽을 본다).
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

/** 축 계산이 날짜에 흔들리지 않도록 기준 시각을 고정한다. */
const NOW = new Date("2026-08-16T12:00:00+09:00");

beforeEach(() => {
  vi.clearAllMocks();
  trackTotals.mockResolvedValue([]);
  classSummaries.mockResolvedValue([]);
  topRules.mockResolvedValue([]);
  listAwardsForChart.mockResolvedValue([]);
  demeritTotalsByStudent.mockResolvedValue([]);
  findStudentsWithClass.mockResolvedValue([]);
});

describe("getMeritStats — 기숙사(누적 트랙)", () => {
  it("since는 그래프 조회에만 넘어간다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    // 최근 12개월 축은 이번 달을 포함해 12칸이므로 2025-09-01 KST가 하한이다.
    expect(listAwardsForChart.mock.calls[0][0].since).toEqual(
      new Date("2025-09-01T00:00:00+09:00"),
    );
  });

  it("합계와 '많이 나온 항목'은 누적 그대로다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(trackTotals.mock.calls[0][0]).not.toHaveProperty("since");
    expect(topRules.mock.calls[0][0]).not.toHaveProperty("since");
    expect(trackTotals.mock.calls[0][0].totalsYear).toBeNull();
    expect(topRules.mock.calls[0][0].totalsYear).toBeNull();
  });

  it("그래프가 덮는 기간을 화면에 적을 수 있게 내보낸다", async () => {
    const stats = await service.getMeritStats(admin, "DORM", undefined, NOW);

    // 이 문자열이 "분류별 분포" 패널의 설명으로 나간다. 없으면 합이 머리글보다
    // 작은 이유가 화면 어디에도 안 나온다.
    expect(stats.chartRange).toBe("최근 12개월");
    expect(stats.year).toBeNull();
  });
});

describe("getMeritStats — 교내(학년도 트랙)", () => {
  it("세 조회가 모두 같은 학년도를 보고, since는 아무 데도 안 간다", async () => {
    await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(listAwardsForChart.mock.calls[0][0].since).toBeUndefined();
    expect(listAwardsForChart.mock.calls[0][0].year).toBe(2026);
    expect(trackTotals.mock.calls[0][0].totalsYear).toBe(2026);
    expect(topRules.mock.calls[0][0].totalsYear).toBe(2026);
  });

  it("범위가 하나뿐이라 그래프 설명도 그 학년도다", async () => {
    const stats = await service.getMeritStats(admin, "SCHOOL", 2025, NOW);
    expect(stats.chartRange).toBe("2025학년도");
  });
});

describe("getMeritSummary — 대시보드 요약", () => {
  it("그래프용 조회를 부르지 않는다", async () => {
    await service.getMeritSummary(admin, "DORM");

    expect(trackTotals).toHaveBeenCalledTimes(1);
    expect(listAwardsForChart).not.toHaveBeenCalled();
    expect(classSummaries).not.toHaveBeenCalled();
    expect(topRules).not.toHaveBeenCalled();
  });

  it("트랙 규칙을 그대로 따른다", async () => {
    const school = await service.getMeritSummary(admin, "SCHOOL");
    expect(school.year).toBe(2026);
    expect(trackTotals.mock.calls[0][0].totalsYear).toBe(2026);

    const dorm = await service.getMeritSummary(admin, "DORM");
    expect(dorm.year).toBeNull();
    expect(trackTotals.mock.calls[1][0].totalsYear).toBeNull();
  });

  it("권한이 없으면 거부한다", async () => {
    const student: SessionUser = { ...admin, id: "u-1", role: "STUDENT" };
    await expect(service.getMeritSummary(student, "SCHOOL")).rejects.toThrow();
    expect(trackTotals).not.toHaveBeenCalled();
  });
});
