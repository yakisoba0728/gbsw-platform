import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { meritAward: { findMany, count } },
}));

const {
  countRecentAwards,
  findRecentAwardPage,
  findRecentAwardsForExport,
} = await import("@/modules/merit/merit.repo");

function award() {
  return {
    id: "a-1",
    year: 2026,
    kind: "DEMERIT",
    label: "점호 지각",
    points: 3,
    note: "22시 점호",
    status: "ACTIVE",
    awardedByName: "이정민",
    cancelledByName: null,
    cancelledAt: null,
    cancelReason: null,
    occurredOn: new Date("2026-08-18T15:00:00.000Z"),
    createdAt: new Date("2026-08-19T01:00:00.000Z"),
    studentProfile: { id: "sp-1", user: { name: "김민준" } },
  };
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([award()]);
  count.mockReset().mockResolvedValue(1);
});

describe("최근 부여 repo", () => {
  const filter = {
    track: "DORM",
    kind: "DEMERIT",
    status: "ACTIVE",
    q: "점호",
  } as const;

  it("필터와 페이지 범위를 DB 쿼리에 적용한다", async () => {
    const rows = await findRecentAwardPage(filter, 20, 20);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          track: "DORM",
          kind: "DEMERIT",
          status: "ACTIVE",
          OR: expect.arrayContaining([
            { label: { contains: "점호", mode: "insensitive" } },
            { awardedByName: { contains: "점호", mode: "insensitive" } },
          ]),
        }),
        orderBy: { createdAt: "desc" },
        skip: 20,
        take: 20,
      }),
    );
    expect(rows[0]).toMatchObject({
      id: "a-1",
      studentProfileId: "sp-1",
      studentName: "김민준",
    });
  });

  it("총 건수에도 화면과 같은 필터를 적용한다", async () => {
    await countRecentAwards(filter);

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ track: "DORM", kind: "DEMERIT" }),
    });
  });

  it("내보내기는 같은 필터를 쓰되 take로 자르지 않는다", async () => {
    await findRecentAwardsForExport(filter);

    expect(findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ track: "DORM" }) }),
    );
  });
});
