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
    studentProfile: {
      id: "sp-1",
      user: { name: "김민준" },
      enrollments: [
        { year: 2025, grade: 1, classNo: 9, number: 30 },
        { year: 2026, grade: 2, classNo: 3, number: 7 },
      ],
    },
  };
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([award()]);
  count.mockReset().mockResolvedValue(1);
});

const UNIQUE_COLUMNS = ["id"];

function expectStableOrder() {
  const orderBy = findMany.mock.calls.at(-1)![0].orderBy;

  expect(Array.isArray(orderBy)).toBe(true);
  expect(orderBy[0]).toEqual({ createdAt: "desc" });

  const last = orderBy.at(-1);
  expect(UNIQUE_COLUMNS).toContain(Object.keys(last)[0]);
  expect(Object.values(last)[0]).toBe("desc");
}

describe("최근 부여 repo", () => {
  const filter = {
    track: "DORM",
    kind: "DEMERIT",
    status: "ACTIVE",
    q: "점호",
  } as const;

  it("필터와 페이지 범위를 DB 쿼리에 적용한다", async () => {
    const rows = await findRecentAwardPage(filter, 20, 20);

    const call = findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      track: "DORM",
      kind: "DEMERIT",
      status: "ACTIVE",
      OR: [
        { label: { contains: "점호", mode: "insensitive" } },
        { note: { contains: "점호", mode: "insensitive" } },
        { awardedByName: { contains: "점호", mode: "insensitive" } },
        {
          studentProfile: {
            user: { name: { contains: "점호", mode: "insensitive" } },
          },
        },
      ],
    });
    expect(call).toMatchObject({ skip: 20, take: 20 });
    expectStableOrder();
    expect(rows[0]).toMatchObject({
      id: "a-1",
      studentProfileId: "sp-1",
      studentName: "김민준",
    });
  });

  it("학급·번호는 그 기록이 난 학년도의 재적에서 온다", async () => {
    const rows = await findRecentAwardPage(filter, 0, 20);

    expect(rows[0]).toMatchObject({ grade: 2, classNo: 3, number: 7 });
  });

  it("그 학년도 재적이 없으면 학급·번호가 null이다", async () => {
    findMany.mockResolvedValueOnce([
      { ...award(), studentProfile: { ...award().studentProfile, enrollments: [] } },
    ]);

    const rows = await findRecentAwardPage(filter, 0, 20);

    expect(rows[0]).toMatchObject({ grade: null, classNo: null, number: null });
  });

  it("반이 없는 재적도 번호는 살린다", async () => {
    findMany.mockResolvedValueOnce([
      {
        ...award(),
        studentProfile: {
          ...award().studentProfile,
          enrollments: [{ year: 2026, grade: null, classNo: null, number: 12 }],
        },
      },
    ]);

    const rows = await findRecentAwardPage(filter, 0, 20);

    expect(rows[0]).toMatchObject({ grade: null, classNo: null, number: 12 });
  });

  it("총 건수에도 화면과 같은 필터를 적용한다", async () => {
    await findRecentAwardPage(filter, 0, 20);
    const pageWhere = findMany.mock.calls.at(-1)![0].where;

    await countRecentAwards(filter);

    expect(count.mock.calls.at(-1)![0].where).toEqual(pageWhere);
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

  it("내보내기 정렬은 화면 페이지와 같다 — 두 파일을 나란히 대조한다", async () => {
    await findRecentAwardPage(filter, 0, 20);
    const pageOrder = findMany.mock.calls.at(-1)![0].orderBy;

    await findRecentAwardsForExport(filter);

    expectStableOrder();
    expect(findMany.mock.calls.at(-1)![0].orderBy).toEqual(pageOrder);
  });
});
