import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

/**
 * 통계 화면의 **범위 비대칭**을 못 박는다.
 *
 * 기숙사는 합계가 입학부터 누적인데 그래프만 최근 12개월을 센다. 그래서
 * "분류별 분포"의 합은 머리글 상점·벌점이나 "많이 나온 항목"의 건수보다 작을
 * 수 있다 — 버그가 아니라 의도다(award.service.ts의 since 주석 참고).
 *
 * 이 결정이 **화면으로는 확인되지 않는다**는 게 여기 테스트를 두는 이유다.
 * 기숙사 기록이 12개월치를 넘기기 전까지 두 범위는 우연히 같아서 아무 차이가
 * 안 보이고, 넘기는 순간 조용히 어긋난다. 그때 "합계도 12개월로 잘라야 하나"
 * 하고 손대면 학생 화면·학부모 화면·확인서와 숫자가 갈라진다.
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

  it("합계와 '많이 나온 항목'은 누적 그대로다 — since도 학년도 조건도 없다", async () => {
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
  it("그래프용 조회를 부르지 않는다 — 합계만 필요하다", async () => {
    await service.getMeritSummary(admin, "DORM");

    expect(trackTotals).toHaveBeenCalledTimes(1);
    expect(listAwardsForChart).not.toHaveBeenCalled();
    expect(classSummaries).not.toHaveBeenCalled();
    expect(topRules).not.toHaveBeenCalled();
  });

  it("트랙 규칙을 그대로 따른다 — 교내는 현재 학년도, 기숙사는 누적", async () => {
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
