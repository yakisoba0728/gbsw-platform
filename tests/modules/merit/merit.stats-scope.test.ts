import { beforeEach, describe, expect, it, vi } from "vitest";
import { user } from "../../helpers/session";

/**
 * 통계 화면의 범위 비대칭을 못 박는다 — 기숙사는 합계가 누적인데 그래프만
 * 최근 12개월이다. 기록이 12개월을 넘기기 전까지 두 범위가 우연히 같아
 * 화면으로는 확인되지 않는다.
 */

const trackTotals = vi.fn();
const trackTotalsBetween = vi.fn();
const awardsByRule = vi.fn();
const listAwardsForChart = vi.fn();
const listClassRoster = vi.fn();
const demeritTotalsByStudent = vi.fn();
const findStudentsWithClass = vi.fn();

vi.mock("@/modules/merit/merit.repo", () => ({
  trackTotals,
  trackTotalsBetween,
  awardsByRule,
  listAwardsForChart,
  listClassRoster,
  demeritTotalsByStudent,
  findStudentsWithClass,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));
class AcademicYearError extends Error {}
const getCurrentYear = vi.fn();
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear,
  AcademicYearError,
}));
// 기준은 이 파일이 검증하는 대상이 아니다 — 목으로 고정해 두어야 학교가 기준을
// 바꿔도 여기 테스트가 흔들리지 않는다 (merit.watch-list.test.ts가 그쪽을 본다).
vi.mock("@/modules/merit/threshold.service", () => ({
  getDemeritThresholds: vi.fn().mockResolvedValue({ warn: 20, danger: 30 }),
}));

const service = await import("@/modules/merit/stats.service");

const admin = user("ADMIN", "admin-1", { name: "이정민" });

/** 축 계산이 날짜에 흔들리지 않도록 기준 시각을 고정한다. */
const NOW = new Date("2026-08-16T12:00:00+09:00");

beforeEach(() => {
  vi.clearAllMocks();
  trackTotals.mockResolvedValue([]);
  trackTotalsBetween.mockResolvedValue([]);
  getCurrentYear.mockResolvedValue(2026);
  awardsByRule.mockResolvedValue({ rows: [], rules: [] });
  listAwardsForChart.mockResolvedValue([]);
  listClassRoster.mockResolvedValue([]);
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
    expect(listAwardsForChart.mock.calls[0][0]).toMatchObject({
      track: "DORM",
      totalsYear: null,
      rosterYear: 2026,
    });
    expect(listAwardsForChart.mock.calls[0][0]).not.toHaveProperty("year");
  });

  it("합계와 '많이 나온 항목'은 누적 그대로다", async () => {
    await service.getMeritStats(admin, "DORM", undefined, NOW);

    expect(trackTotals.mock.calls[0][0]).not.toHaveProperty("since");
    expect(awardsByRule.mock.calls[0][0]).not.toHaveProperty("since");
    expect(trackTotals.mock.calls[0][0].totalsYear).toBeNull();
    expect(awardsByRule.mock.calls[0][0].totalsYear).toBeNull();
  });

  it("그래프가 덮는 기간을 화면에 적을 수 있게 내보낸다", async () => {
    const stats = await service.getMeritStats(admin, "DORM", undefined, NOW);

    // 이 문자열이 "분류별 분포" 패널의 설명으로 나간다. 없으면 합이 머리글보다
    // 작은 이유가 화면 어디에도 안 나온다.
    expect(stats.chartRange).toBe("최근 12개월");
    expect(stats.year).toBeNull();
  });
});

describe("getMeritStats — 「많이 나온 항목」 접기", () => {
  /** repo는 스냅샷별 raw 집계와 현재 규정을 함께 내고, 해석·접기·자르기는 서비스 몫이다. */
  it("이름을 고쳐 갈라진 규정을 한 줄로 접는다", async () => {
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-1",
          label: "지각",
          kind: "DEMERIT",
          _count: { _all: 5 },
          _sum: { points: 10 },
        },
        {
          ruleId: "r-1",
          label: "무단지각",
          kind: "DEMERIT",
          _count: { _all: 2 },
          _sum: { points: 4 },
        },
        {
          ruleId: "r-2",
          label: "봉사",
          kind: "MERIT",
          _count: { _all: 3 },
          _sum: { points: 6 },
        },
      ],
      rules: [
        { id: "r-1", label: "무단지각", category: "생활", active: true },
        { id: "r-2", label: "봉사", category: null, active: true },
      ],
    });

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.topRules).toEqual([
      { label: "무단지각", kind: "DEMERIT", count: 7, points: 14 },
      { label: "봉사", kind: "MERIT", count: 3, points: 6 },
    ]);
  });

  it("자르기는 접은 뒤다 — 갈라진 규정이 순위에서 밀리면 안 된다", async () => {
    // 6건짜리 두 줄로 갈라진 12건 규정이 10건 규정에게 지는 것이 옛 결함이다.
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-big",
          label: "옛 가",
          kind: "DEMERIT",
          _count: { _all: 6 },
          _sum: { points: 6 },
        },
        {
          ruleId: "r-big",
          label: "가",
          kind: "DEMERIT",
          _count: { _all: 6 },
          _sum: { points: 6 },
        },
        {
          ruleId: "r-one",
          label: "나",
          kind: "DEMERIT",
          _count: { _all: 10 },
          _sum: { points: 10 },
        },
      ],
      rules: [
        { id: "r-big", label: "가", category: null, active: true },
        { id: "r-one", label: "나", category: null, active: true },
      ],
    });

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.topRules.map((r) => [r.label, r.count])).toEqual([
      ["가", 12],
      ["나", 10],
    ]);
    // 자르기가 repo로 새면 접기가 무의미해진다.
    expect(awardsByRule.mock.calls[0][0]).not.toHaveProperty("limit");
  });

  it("현재 이름이 같은 별개 규정도 한 줄이다 — 화면 행 key가 (구분·항목)이다", async () => {
    // MeritRule.label에 유일 제약이 없어 같은 이름이 둘 있을 수 있다. 따로 내면
    // 같은 key가 두 번 나오고, 화면에서 구분되지도 않는다.
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-1",
          label: "옛 지각 A",
          kind: "DEMERIT",
          _count: { _all: 4 },
          _sum: { points: 8 },
        },
        {
          ruleId: "r-2",
          label: "옛 지각 B",
          kind: "DEMERIT",
          _count: { _all: 1 },
          _sum: { points: 2 },
        },
      ],
      rules: [
        { id: "r-1", label: "지각", category: "생활", active: true },
        { id: "r-2", label: "지각", category: "출결", active: true },
      ],
    });

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.topRules).toEqual([
      { label: "지각", kind: "DEMERIT", count: 5, points: 10 },
    ]);
  });

  it("현재 규정을 찾지 못하면 부여 시점 이름으로 표시한다", async () => {
    awardsByRule.mockResolvedValue({
      rows: [
        {
          ruleId: "r-gone",
          label: "남은 스냅샷",
          kind: "MERIT",
          _count: { _all: 2 },
          _sum: { points: null },
        },
      ],
      rules: [],
    });

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.topRules).toEqual([
      { label: "남은 스냅샷", kind: "MERIT", count: 2, points: 0 },
    ]);
  });

  it("상위 10개까지만 낸다", async () => {
    awardsByRule.mockResolvedValue({
      rows: Array.from({ length: 12 }, (_, i) => ({
        ruleId: `r-${i}`,
        label: `옛 항목${i}`,
        kind: "DEMERIT",
        _count: { _all: 12 - i },
        _sum: { points: 12 - i },
      })),
      rules: Array.from({ length: 12 }, (_, i) => ({
        id: `r-${i}`,
        label: `항목${i}`,
        category: null,
        active: true,
      })),
    });

    const stats = await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(stats.topRules).toHaveLength(10);
    expect(stats.topRules[0]!.count).toBe(12);
    expect(stats.topRules[9]!.count).toBe(3);
  });
});

describe("getMeritStats — 교내(학년도 트랙)", () => {
  it("세 조회가 모두 같은 학년도를 보고, since는 아무 데도 안 간다", async () => {
    await service.getMeritStats(admin, "SCHOOL", undefined, NOW);

    expect(listAwardsForChart.mock.calls[0][0].since).toBeUndefined();
    expect(listAwardsForChart.mock.calls[0][0].totalsYear).toBe(2026);
    expect(listAwardsForChart.mock.calls[0][0]).not.toHaveProperty("year");
    expect(trackTotals.mock.calls[0][0].totalsYear).toBe(2026);
    expect(awardsByRule.mock.calls[0][0]).toEqual({
      track: "SCHOOL",
      totalsYear: 2026,
      rosterYear: 2026,
      studentProfileIds: undefined,
    });
  });

  it("범위가 하나뿐이라 그래프 설명도 그 학년도다", async () => {
    const stats = await service.getMeritStats(admin, "SCHOOL", 2025, NOW);

    expect(stats.chartRange).toBe("2025학년도");
    expect(listAwardsForChart.mock.calls[0][0]).toMatchObject({
      totalsYear: 2025,
      rosterYear: 2025,
    });
  });
});

describe("getMeritSummary — 대시보드 최근 활동", () => {
  it("오늘을 포함한 7일 창을 발생일로 자른다", async () => {
    await service.getMeritSummary(admin, "SCHOOL", NOW);

    const call = trackTotalsBetween.mock.calls[0][0];
    // NOW가 8월 16일이므로 10일 00:00 ~ 17일 00:00(제외) = 10·11·12·13·14·15·16.
    expect(call.since).toEqual(new Date("2026-08-10T00:00:00+09:00"));
    expect(call.until).toEqual(new Date("2026-08-17T00:00:00+09:00"));
  });

  it("화면에 적을 창을 함께 돌려준다 — 끝은 오늘이지 질의 상한이 아니다", async () => {
    const summary = await service.getMeritSummary(admin, "SCHOOL", NOW);

    // 질의는 17일 00:00까지(제외)지만, 화면이 적을 마지막 날은 16일이다.
    expect(summary.window).toEqual({
      from: new Date("2026-08-10T00:00:00+09:00"),
      to: new Date("2026-08-16T00:00:00+09:00"),
    });
    expect(summary.window.from).toEqual(trackTotalsBetween.mock.calls[0][0].since);
  });

  it("KST 자정 눈금에 맞춘다 — 발생일이 그 눈금이라 UTC로 자르면 하루 밀린다", async () => {
    // UTC로는 8월 16일 15:30이지만 KST로는 17일 00:30이다.
    await service.getMeritSummary(admin, "SCHOOL", new Date("2026-08-17T00:30:00+09:00"));

    expect(trackTotalsBetween.mock.calls[0][0].since).toEqual(
      new Date("2026-08-11T00:00:00+09:00"),
    );
  });

  it("상쇄점은 창에서 통째로 빠진다 — 건수에서도 빠진다", async () => {
    await service.getMeritSummary(admin, "SCHOOL", NOW);

    expect([...trackTotalsBetween.mock.calls[0][0].kinds]).toEqual([
      "MERIT",
      "DEMERIT",
    ]);
  });

  it("순점수는 상점 − 벌점이다 (상쇄점이 없으므로)", async () => {
    trackTotalsBetween.mockResolvedValue([
      { kind: "MERIT", _count: { _all: 4 }, _sum: { points: 12 } },
      { kind: "DEMERIT", _count: { _all: 3 }, _sum: { points: 5 } },
    ]);

    const summary = await service.getMeritSummary(admin, "SCHOOL", NOW);

    expect(summary.totals.awardCount).toBe(7);
    expect(summary.totals.merit).toBe(12);
    expect(summary.totals.demerit).toBe(5);
    expect(summary.totals.offset).toBe(0);
    expect(summary.totals.net).toBe(7);
  });

  it("학년도로 자르지 않는다 — 3월 초 창이 두 학년도에 걸쳐도 잘리면 안 된다", async () => {
    await service.getMeritSummary(admin, "SCHOOL", NOW);

    const call = trackTotalsBetween.mock.calls[0][0];
    expect(call).not.toHaveProperty("totalsYear");
    expect(call).not.toHaveProperty("year");
  });

  it("두 트랙이 같은 창을 보고, 트랙만 다르다", async () => {
    await service.getMeritSummary(admin, "SCHOOL", NOW);
    await service.getMeritSummary(admin, "DORM", NOW);

    const [school, dorm] = trackTotalsBetween.mock.calls.map((c) => c[0]);
    expect(school.track).toBe("SCHOOL");
    expect(dorm.track).toBe("DORM");
    // 기숙사가 누적 트랙이라고 해서 창이 넓어지지 않는다 — 최근 활동은 트랙과 무관하다.
    expect(dorm.since).toEqual(school.since);
    expect(dorm.until).toEqual(school.until);
  });

  it("그래프용 조회를 부르지 않는다", async () => {
    await service.getMeritSummary(admin, "DORM", NOW);

    expect(trackTotals).not.toHaveBeenCalled();
    expect(listAwardsForChart).not.toHaveBeenCalled();
    expect(listClassRoster).not.toHaveBeenCalled();
    expect(awardsByRule).not.toHaveBeenCalled();
  });

  it("권한이 없으면 거부한다", async () => {
    const student = user("STUDENT", "u-1", { name: "이정민" });
    await expect(service.getMeritSummary(student, "SCHOOL", NOW)).rejects.toThrow();
    expect(trackTotalsBetween).not.toHaveBeenCalled();
  });

  // 창 계산에는 학년도가 필요 없지만, 없는 상태에서 0을 내면 "조용한 주"와
  // 구별되지 않는다. 대시보드가 안내 카드로 바꿔 보여줄 수 있게 던져야 한다.
  it("현재 학년도가 없으면 숫자 대신 오류를 낸다", async () => {
    getCurrentYear.mockRejectedValue(new AcademicYearError("NO_CURRENT_YEAR"));

    await expect(service.getMeritSummary(admin, "SCHOOL", NOW)).rejects.toBeInstanceOf(
      AcademicYearError,
    );
    expect(trackTotalsBetween).not.toHaveBeenCalled();
  });
});
