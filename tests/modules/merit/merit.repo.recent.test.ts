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
      // 재적은 학년도로 걸러 오지 않는다 — 중첩 where가 바깥 행의 year를 못 본다.
      // 그래서 지난 학년도 줄이 함께 오고, 매핑이 그 기록의 학년도를 고른다.
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
    // 쪽을 나누는 질의다 — 여기서 정렬키가 하나뿐이면 쪽 경계에서 줄이 사라진다.
    expectStableOrder();
    expect(rows[0]).toMatchObject({
      id: "a-1",
      studentProfileId: "sp-1",
      studentName: "김민준",
    });
  });

  /**
   * 같은 이름이 두 반에 있으면 목록에서 학급·번호가 유일한 구분이다.
   * 재적을 통째로 받아 매핑에서 고르므로, 고르는 쪽이 틀리면 지난 학년도의
   * 반이 조용히 붙는다 — 화면은 멀쩡해 보이고 사람만 다르다.
   */
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
