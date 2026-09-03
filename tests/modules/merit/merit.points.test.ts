import { describe, expect, it } from "vitest";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";
import {
  DEFAULT_DEMERIT_THRESHOLDS,
  addKindPoints,
  addKindTotals,
  demeritLevel,
  emptyKindTotals,
  meritKindDelta,
  netScore,
  signedNet,
  withNetScore,
} from "@/modules/merit/merit.points";

// core(authz/merit-track)는 종류 정의만 남기고 합계·순점수 산술은 merit 모듈이 소유한다.

describe("종류별 합계", () => {
  it("빈 합계는 세 칸이 모두 0이다", () => {
    expect(emptyKindTotals()).toEqual({ merit: 0, demerit: 0, offset: 0 });
  });

  it("같은 종류를 여러 번 더하면 쌓인다", () => {
    const totals = emptyKindTotals();
    addKindPoints(totals, "DEMERIT", 3);
    addKindPoints(totals, "DEMERIT", 4);
    expect(totals.demerit).toBe(7);
  });

  it("모든 종류가 자기 칸 하나만 움직인다 — 종류가 늘면 여기서 깨진다", () => {
    for (const kind of MERIT_KINDS) {
      const totals = emptyKindTotals();
      addKindPoints(totals, kind, 5);

      const moved = Object.entries(totals).filter(([, value]) => value !== 0);
      expect(moved, `${kind}가 어느 칸에도 안 들어간다`).toHaveLength(1);
      expect(moved[0][1]).toBe(5);
    }
  });

  it("상쇄점은 상점 칸에도 벌점 칸에도 접히지 않는다", () => {
    const totals = emptyKindTotals();
    addKindPoints(totals, "OFFSET", 60);

    expect(totals).toEqual({ merit: 0, demerit: 0, offset: 60 });
  });

  it("모르는 종류는 어느 칸도 움직이지 않는다 — 합계를 조용히 틀리게 두지 않는다", () => {
    const totals = emptyKindTotals();
    addKindPoints(totals, "BONUS", 100);

    expect(totals).toEqual({ merit: 0, demerit: 0, offset: 0 });
  });

  it("합계끼리 더하면 칸이 하나도 빠지지 않는다", () => {
    const target = { merit: 1, demerit: 2, offset: 3 };
    addKindTotals(target, { merit: 10, demerit: 20, offset: 30 });

    expect(target).toEqual({ merit: 11, demerit: 22, offset: 33 });
  });
});

describe("순점수", () => {
  it("순점수 = 상점 + 상쇄 − 벌점", () => {
    expect(netScore({ merit: 10, demerit: 4, offset: 1 })).toBe(7);
  });

  it("상쇄점이 순점수를 올린다 — 벌점을 덜어내기 때문이다", () => {
    const withoutOffset = netScore({ merit: 0, demerit: 30, offset: 0 });
    const withOffset = netScore({ merit: 0, demerit: 30, offset: 20 });

    expect(withoutOffset).toBe(-30);
    expect(withOffset).toBe(-10);
  });

  it("음수가 될 수 있다", () => {
    expect(netScore({ merit: 2, demerit: 9, offset: 0 })).toBe(-7);
  });

  it("종류 정의와 산술이 한결같다", () => {
    const points = 7;
    for (const kind of MERIT_KINDS) {
      const totals = emptyKindTotals();
      addKindPoints(totals, kind, points);

      expect(netScore(totals), kind).toBe(meritKindDelta(kind) * points);
    }
  });

  it("withNetScore는 세 칸에 순점수를 붙여 준다", () => {
    expect(withNetScore({ merit: 10, demerit: 4, offset: 1 })).toEqual({
      merit: 10,
      demerit: 4,
      offset: 1,
      net: 7,
    });
  });
});

describe("순점수 표시", () => {
  it.each([
    [7, "+7"],
    [0, "+0"],
    [-3, "-3"],
  ])("%i를 %s로 표시한다", (net, expected) => {
    expect(signedNet(net)).toBe(expected);
  });
});

describe("벌점 단계", () => {
  const thresholds = { warn: 20, danger: 30 };

  it.each([
    [0, "none"],
    [19, "none"],
    [20, "warn"],
    [30, "danger"],
    [999, "danger"],
  ] as const)("벌점 %i는 %s 단계다", (demerit, expected) => {
    expect(demeritLevel(thresholds, demerit)).toBe(expected);
  });

  it("기준 설정에 따라 같은 점수의 단계가 달라진다", () => {
    expect(demeritLevel({ warn: 5, danger: 10 }, 7)).toBe("warn");
    expect(demeritLevel({ warn: 50, danger: 100 }, 7)).toBe("none");
  });
});

describe("기본 벌점 기준", () => {
  it("모든 트랙의 기본값이 유효하다", () => {
    for (const track of MERIT_TRACKS) {
      const { warn, danger } = DEFAULT_DEMERIT_THRESHOLDS[track];
      expect(Number.isInteger(warn), track).toBe(true);
      expect(Number.isInteger(danger), track).toBe(true);
      expect(warn, track).toBeGreaterThanOrEqual(1);
      expect(danger, track).toBeGreaterThan(warn);
    }
  });
});
