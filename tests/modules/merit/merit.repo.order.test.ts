import { beforeEach, describe, expect, it, vi } from "vitest";

const meritRuleFindMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { meritRule: { findMany: meritRuleFindMany } },
}));

const { listActiveRules, listRules } = await import("@/modules/merit/merit.repo");

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

describe("listRules — 종류 → 분류 → 점수", () => {
  it("벌점이 앞에 담겨 와도 상점을 앞으로 세운다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "d1", kind: "DEMERIT", points: 3 }),
      rule({ id: "m1", kind: "MERIT", points: 2 }),
      rule({ id: "d2", kind: "DEMERIT", points: 1 }),
      rule({ id: "m2", kind: "MERIT", points: 10 }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "d2", "d1"]);
  });

  it("같은 종류 안에서는 분류가 점수보다 먼저다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "b-low", category: "학교 활동", points: 1 }),
      rule({ id: "a-high", category: "교내 환경", points: 10 }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.id)).toEqual(["a-high", "b-low"]);
  });

  it("분류는 한글 가나다순이다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "h", category: "학교 활동" }),
      rule({ id: "g", category: "교내 환경" }),
      rule({ id: "s", category: "선행 질서" }),
      rule({ id: "m", category: "명예 표창" }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.category)).toEqual([
      "교내 환경",
      "명예 표창",
      "선행 질서",
      "학교 활동",
    ]);
  });

  it("분류가 없는 규정은 맨 뒤로 간다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "none", category: null, points: 1 }),
      rule({ id: "empty", category: "", points: 1 }),
      rule({ id: "has", category: "교내 환경", points: 9 }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows[0].id).toBe("has");
    expect(rows.slice(1).map((r) => r.id).sort()).toEqual(["empty", "none"]);
  });

  it("같은 분류 안에서는 점수가 낮은 것부터다", async () => {
    meritRuleFindMany.mockResolvedValue([
      rule({ id: "a", kind: "MERIT", category: "선행 질서", points: 60 }),
      rule({ id: "b", kind: "MERIT", category: "선행 질서", points: 1 }),
      rule({ id: "c", kind: "MERIT", category: "선행 질서", points: 10 }),
    ]);

    const rows = await listRules("SCHOOL");

    expect(rows.map((r) => r.points)).toEqual([1, 10, 60]);
  });

  it("삭제된 규정은 질의에서 아예 빠진다", async () => {
    meritRuleFindMany.mockResolvedValue([]);

    await listRules("SCHOOL");

    expect(meritRuleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { track: "SCHOOL", active: true } }),
    );
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
