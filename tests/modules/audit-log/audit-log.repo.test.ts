import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { auditLog: { findMany } },
}));

const { findPage } = await import("@/modules/audit-log/audit-log.repo");

const UNIQUE_COLUMNS = ["id"];

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
});

describe("findPage — 쪽 경계", () => {
  const filter = { since: null };

  it("정렬키가 둘 이상이고 마지막 키는 유일한 열이다", async () => {
    await findPage(filter, 0, 50);

    const orderBy = findMany.mock.calls[0]![0].orderBy;

    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy.length).toBeGreaterThan(1);
    expect(orderBy[0]).toEqual({ createdAt: "desc" });

    const last = orderBy.at(-1);
    expect(UNIQUE_COLUMNS).toContain(Object.keys(last)[0]);
    expect(Object.values(last)[0]).toBe("desc");
  });

  it("쪽 범위를 그대로 넘긴다", async () => {
    await findPage(filter, 100, 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    );
  });
});
