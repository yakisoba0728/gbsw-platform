import { beforeEach, describe, expect, it, vi } from "vitest";

const meritRuleFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { meritRule: { findMany: meritRuleFindMany } },
}));

const { listActiveRules, listRules } = await import("@/modules/merit/merit.repo");

/**
 * kind는 문자열 열이라 Prisma의 `kind: "asc"`는 사전순으로 정렬한다 —
 * "DEMERIT" < "MERIT"이라 **벌점이 먼저 나왔다.** 규정표는 상점부터 읽는 것이
 * 자연스럽고 원본 표도 그 순서다. 이 테스트가 그 회귀를 막는다.
 */
function rule(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "r",
    track: "SCHOOL",
    kind: "MERIT",
    label: "항목",
    points: 5,
    category: "분류",
    description: null,
    active: true,
    ...over,
  };
}

beforeEach(() => {
  meritRuleFindMany.mockReset();
});

describe("listRules — 상점이 먼저 나온다", () => {
  it("벌점이 앞에 담겨 와도 상점을 앞으로 세운다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "d1", kind: "DEMERIT", points: 3 }),
      rule({ id: "m1", kind: "MERIT", points: 2 }),
      rule({ id: "d2", kind: "DEMERIT", points: 1 }),
      rule({ id: "m2", kind: "MERIT", points: 10 }),
    ]);

    const rows = await listRules("SCHOOL");

    // 상점(m1 2점 → m2 10점) 다음에 벌점(d2 1점 → d1 3점). 같은 종류 안은 점수순이다.
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "d2", "d1"]);
  });

  it("같은 종류 안에서는 점수가 낮은 것부터다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "a", kind: "MERIT", points: 60 }),
      rule({ id: "b", kind: "MERIT", points: 1 }),
      rule({ id: "c", kind: "MERIT", points: 10 }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.points)).toEqual([1, 10, 60]);
  });

  it("사용 중인 규정이 중지된 것보다 먼저다 — 그 안에서 다시 상점 먼저", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "off-m", kind: "MERIT", active: false }),
      rule({ id: "on-d", kind: "DEMERIT", active: true }),
      rule({ id: "off-d", kind: "DEMERIT", active: false }),
      rule({ id: "on-m", kind: "MERIT", active: true }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.id)).toEqual(["on-m", "on-d", "off-m", "off-d"]);
  });

  it("모르는 종류가 섞여도 터지지 않고 맨 뒤로 간다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "x", kind: "BONUS" }),
      rule({ id: "m", kind: "MERIT" }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.id)).toEqual(["m", "x"]);
  });
});

describe("listActiveRules — 부여 화면 선택지도 상점이 먼저", () => {
  it("상점 → 벌점 순으로 나온다", async () => {
    meritRuleFindMany.mockResolvedValue([
      { id: "d", kind: "DEMERIT", label: "벌", points: 3, category: null },
      { id: "m", kind: "MERIT", label: "상", points: 5, category: null },
    ]);

    const rows = await listActiveRules("DORM");

    expect(rows.map((r) => r.id)).toEqual(["m", "d"]);
  });

  it("비활성은 질의에서 빠진다", async () => {
    meritRuleFindMany.mockResolvedValue([]);

    await listActiveRules("DORM");

    expect(meritRuleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { track: "DORM", active: true } }),
    );
  });
});
