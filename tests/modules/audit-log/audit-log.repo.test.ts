import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { auditLog: { findMany } },
}));

const { findPage } = await import("@/modules/audit-log/audit-log.repo");

/** AuditLog에서 유일한 열. 보조 정렬키로 쓸 수 있는 것은 이것뿐이다. */
const UNIQUE_COLUMNS = ["id"];

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
});

describe("findPage — 쪽 경계", () => {
  const filter = { since: null };

  /**
   * 감사로그는 append-only 근거 자료라 「안 보인다」가 곧 「없다」로 읽힌다.
   * createdAt은 유일하지 않다 — 기본값 CURRENT_TIMESTAMP가 Postgres에서는
   * 트랜잭션 시작 시각이라, 명단 일괄 반영 한 번이 남긴 수백 줄이 밀리초까지 같은
   * 값을 갖는다. 그 키 하나로 세운 채 OFFSET으로 쪽을 나누면 동점 구간 순서가
   * 쪽마다 뒤집혀 어느 쪽에도 안 나오는 줄이 생긴다.
   *
   * 값을 그대로 베껴 단언하지 않는다 — 「보조 정렬키가 있다」는 의도를 본다.
   */
  it("정렬키가 둘 이상이고 마지막 키는 유일한 열이다", async () => {
    await findPage(filter, 0, 50);

    const orderBy = findMany.mock.calls[0]![0].orderBy;

    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy.length).toBeGreaterThan(1);
    expect(orderBy[0]).toEqual({ createdAt: "desc" });

    const last = orderBy.at(-1);
    expect(UNIQUE_COLUMNS).toContain(Object.keys(last)[0]);
    // 방향까지 앞 키와 같아야 한다 — 동점 구간만 거꾸로 서면 읽는 사람이 못 믿는다.
    expect(Object.values(last)[0]).toBe("desc");
  });

  it("쪽 범위를 그대로 넘긴다", async () => {
    await findPage(filter, 100, 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    );
  });
});
