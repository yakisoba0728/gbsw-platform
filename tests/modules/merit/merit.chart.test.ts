import { describe, expect, it } from "vitest";
import {
  categoryDistribution,
  monthlyTotals,
  rollingMonths,
  scaleToPercent,
  schoolYearMonths,
  type ChartAward,
} from "@/modules/merit/merit.chart";

/** KST 기준 시각을 만든다 (KST = UTC+9). */
function kst(iso: string): Date {
  return new Date(`${iso}+09:00`);
}

function award(over: Partial<ChartAward> = {}): ChartAward {
  return {
    createdAt: kst("2026-03-15T10:00:00"),
    kind: "MERIT",
    points: 5,
    rule: { category: "교내 환경" },
    ...over,
  };
}

describe("schoolYearMonths — 학년도 축은 3월에 시작한다", () => {
  it("3월부터 이듬해 2월까지 12칸이다", () => {
    const axis = schoolYearMonths(2026);

    expect(axis).toHaveLength(12);
    expect(axis[0]).toEqual({ key: "2026-03", label: "3월" });
    expect(axis[9]).toEqual({ key: "2026-12", label: "12월" });
    expect(axis[10]).toEqual({ key: "2027-01", label: "1월" });
    expect(axis[11]).toEqual({ key: "2027-02", label: "2월" });
  });

  it("1~12월이 아니다 — 학년도가 두 토막으로 보이면 안 된다", () => {
    expect(schoolYearMonths(2026)[0].label).not.toBe("1월");
  });
});

describe("rollingMonths — 누적 트랙의 최근 12개월", () => {
  it("지금 달로 끝나는 12칸이다", () => {
    const axis = rollingMonths(kst("2026-08-16T12:00:00"));

    expect(axis).toHaveLength(12);
    expect(axis[11]).toEqual({ key: "2026-08", label: "8월" });
    expect(axis[0]).toEqual({ key: "2025-09", label: "9월" });
  });

  it("연도를 넘어가도 달 계산이 안 깨진다", () => {
    const axis = rollingMonths(kst("2026-01-05T12:00:00"));

    expect(axis[11].key).toBe("2026-01");
    expect(axis[0].key).toBe("2025-02");
  });
});

describe("monthlyTotals", () => {
  const axis = schoolYearMonths(2026);

  it("상쇄점이 순점수에 반영된다 — 상점 10 + 상쇄 6 − 벌점 20 = −4", () => {
    const points = monthlyTotals(
      [
        award({ kind: "MERIT", points: 10 }),
        award({ kind: "DEMERIT", points: 20 }),
        award({ kind: "OFFSET", points: 6 }),
      ],
      axis,
    );

    const march = points.find((p) => p.key === "2026-03")!;
    expect(march).toMatchObject({ merit: 10, demerit: 20, offset: 6, net: -4 });
  });

  it("상쇄점을 상점이나 벌점에 접지 않는다", () => {
    const points = monthlyTotals([award({ kind: "OFFSET", points: 60 })], axis);
    const march = points.find((p) => p.key === "2026-03")!;

    expect(march.merit).toBe(0);
    expect(march.demerit).toBe(0);
    expect(march.offset).toBe(60);
  });

  it("기록이 없는 달도 0으로 남는다 — 빼면 시간 간격이 왜곡된다", () => {
    const points = monthlyTotals([award()], axis);

    expect(points).toHaveLength(12);
    expect(points.filter((p) => p.merit === 0 && p.demerit === 0)).toHaveLength(11);
  });

  it("월 구분이 KST 기준이다 — 밤 11시 부여가 전날로 밀리지 않는다", () => {
    // KST 4월 1일 00:30 = UTC 3월 31일 15:30. UTC로 자르면 3월로 새어 나간다.
    const points = monthlyTotals(
      [award({ createdAt: kst("2026-04-01T00:30:00"), points: 7 })],
      axis,
    );

    expect(points.find((p) => p.key === "2026-04")!.merit).toBe(7);
    expect(points.find((p) => p.key === "2026-03")!.merit).toBe(0);
  });

  it("월말 밤 시각도 그 달에 남는다", () => {
    // KST 3월 31일 23:30 = UTC 3월 31일 14:30 — 둘 다 3월이라 안전한 대조군.
    const points = monthlyTotals(
      [award({ createdAt: kst("2026-03-31T23:30:00"), points: 3 })],
      axis,
    );

    expect(points.find((p) => p.key === "2026-03")!.merit).toBe(3);
  });

  it("축 밖의 기록은 버린다", () => {
    const points = monthlyTotals(
      [award({ createdAt: kst("2020-05-05T10:00:00"), points: 99 })],
      axis,
    );

    expect(points.every((p) => p.merit === 0)).toBe(true);
  });

  it("빈 입력이면 12칸이 전부 0이다", () => {
    const points = monthlyTotals([], axis);

    expect(points).toHaveLength(12);
    expect(points.every((p) => p.net === 0)).toBe(true);
  });
});

describe("categoryDistribution", () => {
  it("같은 분류라도 종류가 다르면 따로 센다", () => {
    const slices = categoryDistribution([
      award({ kind: "MERIT", rule: { category: "교내 생활" }, points: 2 }),
      award({ kind: "DEMERIT", rule: { category: "교내 생활" }, points: 3 }),
      award({ kind: "DEMERIT", rule: { category: "교내 생활" }, points: 3 }),
    ]);

    expect(slices).toHaveLength(2);
    expect(slices.find((s) => s.kind === "MERIT")).toMatchObject({
      count: 1,
      points: 2,
    });
    expect(slices.find((s) => s.kind === "DEMERIT")).toMatchObject({
      count: 2,
      points: 6,
    });
  });

  it("상점이 먼저, 그 안에서 건수가 많은 것부터", () => {
    const slices = categoryDistribution([
      award({ kind: "DEMERIT", rule: { category: "출결 수업" } }),
      award({ kind: "MERIT", rule: { category: "학교 활동" } }),
      award({ kind: "MERIT", rule: { category: "교내 환경" } }),
      award({ kind: "MERIT", rule: { category: "교내 환경" } }),
    ]);

    expect(slices[0]).toMatchObject({ kind: "MERIT", category: "교내 환경", count: 2 });
    expect(slices[1]).toMatchObject({ kind: "MERIT", category: "학교 활동" });
    expect(slices[2]).toMatchObject({ kind: "DEMERIT" });
  });

  it("분류가 없으면 '분류 없음'으로 묶는다", () => {
    const slices = categoryDistribution([
      award({ rule: { category: null } }),
      award({ rule: null }),
    ]);

    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ category: "분류 없음", count: 2 });
  });
});

describe("scaleToPercent", () => {
  it("가장 큰 값이 100%다", () => {
    expect(scaleToPercent([5, 10, 20])).toEqual([25, 50, 100]);
  });

  it("음수는 절댓값으로 잰다 — 길이는 방향과 무관하다", () => {
    expect(scaleToPercent([-20, 10])).toEqual([100, 50]);
  });

  it("전부 0이면 0으로 나누지 않고 전부 0%다", () => {
    // 부여가 하나도 없는 화면에서 실제로 닿는 경로다.
    expect(scaleToPercent([0, 0, 0])).toEqual([0, 0, 0]);
    expect(scaleToPercent([])).toEqual([]);
  });
});
