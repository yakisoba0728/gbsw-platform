import { describe, expect, it } from "vitest";
import {
  addKindPoints,
  addKindTotals,
  emptyKindTotals,
  isMeritKind,
  isMeritTrack,
  isYearScoped,
  meritKindDelta,
  MERIT_KIND_LABELS,
  MERIT_KINDS,
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  netScore,
  signedNet,
  withNetScore,
} from "@/core/authz/merit-track";

describe("MeritTrack", () => {
  it("트랙은 교내와 기숙사 둘뿐이다", () => {
    expect(MERIT_TRACKS).toEqual(["SCHOOL", "DORM"]);
  });

  it("모든 트랙에 한글 라벨이 있다", () => {
    for (const track of MERIT_TRACKS) {
      expect(MERIT_TRACK_LABELS[track]).toBeTruthy();
    }
    expect(MERIT_TRACK_LABELS.SCHOOL).toBe("교내");
    expect(MERIT_TRACK_LABELS.DORM).toBe("기숙사");
  });

  it("교내만 학년도별로 센다 — 기숙사는 전체 누적이다", () => {
    expect(isYearScoped("SCHOOL")).toBe(true);
    expect(isYearScoped("DORM")).toBe(false);
  });

  it("모르는 값은 트랙이 아니다", () => {
    expect(isMeritTrack("SCHOOL")).toBe(true);
    expect(isMeritTrack("DORM")).toBe(true);
    expect(isMeritTrack("school")).toBe(false);
    expect(isMeritTrack("CLUB")).toBe(false);
    expect(isMeritTrack(null)).toBe(false);
    expect(isMeritTrack(1)).toBe(false);
  });
});

describe("MeritKind", () => {
  it("종류는 상점·벌점·상쇄점 셋이다 — 순서는 학교 규정표와 같다", () => {
    expect(MERIT_KINDS).toEqual(["MERIT", "DEMERIT", "OFFSET"]);
  });

  it("모든 종류에 한글 라벨이 있다", () => {
    expect(MERIT_KIND_LABELS.MERIT).toBe("상점");
    expect(MERIT_KIND_LABELS.DEMERIT).toBe("벌점");
    expect(MERIT_KIND_LABELS.OFFSET).toBe("상쇄점");
  });

  it("상쇄점은 상점이 아니다 — 벌점을 덜어내는 행정 조치라 종류를 따로 둔다", () => {
    expect(MERIT_KIND_LABELS.OFFSET).not.toBe(MERIT_KIND_LABELS.MERIT);
    expect(isMeritKind("OFFSET")).toBe(true);
  });

  it("모르는 값은 종류가 아니다", () => {
    expect(isMeritKind("MERIT")).toBe(true);
    expect(isMeritKind("BONUS")).toBe(false);
    expect(isMeritKind(undefined)).toBe(false);
  });
});

/**
 * 종류→칸 접기와 순점수.
 *
 * 예전엔 이 계산이 네 곳(부여 합계·반 명단·반별 요약·월별 추이)에 손으로 복제돼
 * 있었고, 넷 중 하나만 잘못 고치면 같은 학생의 순점수가 화면마다 달라졌다.
 * **여기 모인 뒤로는 이 테스트가 그 넷 전부를 대신 지킨다.**
 */
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

  /**
   * **종류가 하나 더 생기면 이 테스트가 깨진다.** 새 종류가 어느 칸에도 안 들어가면
   * "칸 하나가 움직였다"가 성립하지 않기 때문이다 — monthlyTotals가 새 종류를
   * 말없이 버리던 실패를 여기서 잡는다.
   */
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

  /** 학생별 합계를 반별로 모을 때처럼, 칸이 이미 나뉜 값끼리 더하는 자리다. */
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

  /**
   * 순점수의 부호 규칙은 meritKindDelta가 정한다. 둘이 갈리면 그래프의 막대와
   * 합계 카드가 서로 다른 이야기를 하게 된다.
   */
  it("meritKindDelta와 어긋나지 않는다", () => {
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

/**
 * 화면에 찍히는 순점수 부호. 예전엔 `n >= 0 ? "+" : ""`가 13곳에 흩어져 있었다.
 * **음수는 보통 빼기 기호(하이픈)** — 종류 배지의 `−`(U+2212)와 다르다.
 * 저건 종류가 정하는 표기고 이건 숫자 자체의 부호다.
 */
describe("signedNet", () => {
  it("양수에는 +를 붙인다", () => {
    expect(signedNet(7)).toBe("+7");
  });

  it("0도 +0이다 — 부호 없는 0만 따로 보이면 표가 어긋나 보인다", () => {
    expect(signedNet(0)).toBe("+0");
  });

  it("음수는 숫자가 가진 부호를 그대로 쓴다", () => {
    expect(signedNet(-3)).toBe("-3");
  });
});
