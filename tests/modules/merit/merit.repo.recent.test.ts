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

/** MeritAward에서 유일한 열. 보조 정렬키로 쓸 수 있는 것은 이것뿐이다. */
const UNIQUE_COLUMNS = ["id"];

/**
 * 마지막 findMany 호출의 정렬을 본다. 값을 그대로 베껴 단언하면 다음 사람이 키를
 * 하나로 되돌리면서 단언도 같이 고치면 그만이라, 「보조 정렬키가 있다」는 의도를
 * 본다 — **배열이고, 첫 키가 createdAt desc이고, 마지막 키가 유일한 열**이다.
 *
 * createdAt은 유일하지 않다: 기본값 CURRENT_TIMESTAMP가 Postgres에서는 트랜잭션
 * 시작 시각이라 일괄 부여 한 번이 넣은 행이 전부 같은 값을 갖는다. 그 키 하나로
 * 세운 채 OFFSET으로 쪽을 나누면 동점 구간 순서가 쪽마다 뒤집혀 줄이 사라진다.
 */
function expectStableOrder() {
  const orderBy = findMany.mock.calls.at(-1)![0].orderBy;

  expect(Array.isArray(orderBy)).toBe(true);
  expect(orderBy[0]).toEqual({ createdAt: "desc" });

  const last = orderBy.at(-1);
  expect(UNIQUE_COLUMNS).toContain(Object.keys(last)[0]);
  // 방향까지 앞 키와 같아야 한다 — 동점 구간만 거꾸로 서면 읽는 사람이 못 믿는다.
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
        skip: 20,
        take: 20,
      }),
    );
    // 쪽을 나누는 질의다 — 여기서 정렬키가 하나뿐이면 쪽 경계에서 줄이 사라진다.
    expectStableOrder();
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

  it("내보내기 정렬은 화면 페이지와 같다 — 두 파일을 나란히 대조한다", async () => {
    await findRecentAwardPage(filter, 0, 20);
    const pageOrder = findMany.mock.calls.at(-1)![0].orderBy;

    await findRecentAwardsForExport(filter);

    expectStableOrder();
    expect(findMany.mock.calls.at(-1)![0].orderBy).toEqual(pageOrder);
  });
});
