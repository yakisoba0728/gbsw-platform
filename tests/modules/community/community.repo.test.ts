import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/db/client", () => ({
  prisma: {},
  withTransaction: vi.fn(),
}));

const repo = await import("@/modules/community/community.repo");

const queryRaw = vi.fn();

beforeEach(() => {
  queryRaw.mockReset();
});

function sqlAt(index: number): string {
  return queryRaw.mock.calls[index]![0].join(" ");
}

describe("미결 첨부 청소", () => {
  const cutoff = new Date("2026-09-03T00:00:00.000Z");

  it("지울 후보를 조건째로 잠근 채 읽는다 — 잠그지 않으면 그사이 글에 붙은 첨부가 목록에 남는다", async () => {
    queryRaw.mockResolvedValueOnce([]);

    await repo.lockStalePending("u-1", cutoff, { $queryRaw: queryRaw } as never);

    const sql = sqlAt(0);
    expect(sql).toContain('FROM "CommunityAttachment"');
    expect(sql).toContain('"postId" IS NULL');
    expect(sql).toContain('"createdAt" <');
    expect(sql).toContain("FOR UPDATE");
    // 동시에 도는 청소끼리 교착하지 않도록 잠그는 순서를 고정한다.
    expect(sql).toContain('ORDER BY "id"');
    expect(queryRaw.mock.calls[0]!.slice(1)).toEqual([cutoff, "u-1"]);
  });

  it("삭제는 id만이 아니라 조건을 다시 붙인다 — id 목록은 잠금 전의 사실이다", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "old1" }]);

    await repo.deleteStalePending(["old1", "old2"], cutoff, {
      $queryRaw: queryRaw,
    } as never);

    const sql = sqlAt(0);
    expect(sql).toContain('DELETE FROM "CommunityAttachment"');
    expect(sql).toContain('"id" IN (');
    expect(sql).toContain('"postId" IS NULL');
    expect(sql).toContain('"createdAt" <');
    expect(sql).toContain('RETURNING "id"');

    const ids = queryRaw.mock.calls[0]![1] as { values: string[] };
    expect(ids.values).toEqual(["old1", "old2"]);
    expect(queryRaw.mock.calls[0]![2]).toBe(cutoff);
  });

  it("실제로 지워진 id만 돌려준다 — 감사로그와 디스크 삭제가 이 값만 본다", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "old1" }]);

    await expect(
      repo.deleteStalePending(["old1", "old2"], cutoff, {
        $queryRaw: queryRaw,
      } as never),
    ).resolves.toEqual(["old1"]);
  });

  it("지울 것이 없으면 문장을 보내지 않는다", async () => {
    await expect(
      repo.deleteStalePending([], cutoff, { $queryRaw: queryRaw } as never),
    ).resolves.toEqual([]);

    expect(queryRaw).not.toHaveBeenCalled();
  });
});
