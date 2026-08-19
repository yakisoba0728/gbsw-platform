import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const executeRaw = vi.fn();
const updateMany = vi.fn();
const create = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    $executeRaw: executeRaw,
    verificationCode: { count, updateMany, create },
  },
}));

const {
  consume,
  countRecentSends,
  countRecentSendsByIp,
  expirePending,
  insertCode,
  lockSendRateLimitBuckets,
} = await import("@/modules/verification/verification.repo");

beforeEach(() => {
  count.mockReset();
  executeRaw.mockReset();
  updateMany.mockReset();
  create.mockReset();
});

describe("verification.repo rate-limit primitives", () => {
  it("counts recent rows for the same channel and target", async () => {
    count.mockResolvedValueOnce(4);
    const since = new Date("2026-08-19T00:00:00.000Z");

    await expect(countRecentSends("EMAIL", "a@b.kr", since)).resolves.toBe(4);

    expect(count).toHaveBeenCalledWith({
      where: { channel: "EMAIL", target: "a@b.kr", createdAt: { gte: since } },
    });
  });

  it("counts recent rows for the same request IP across channels", async () => {
    count.mockResolvedValueOnce(19);
    const since = new Date("2026-08-19T00:00:00.000Z");

    await expect(countRecentSendsByIp("203.0.113.9", since)).resolves.toBe(19);

    expect(count).toHaveBeenCalledWith({
      where: { requestIp: "203.0.113.9", createdAt: { gte: since } },
    });
  });

  it("takes transaction-scoped advisory locks for target and IP buckets", async () => {
    const tx = { $executeRaw: executeRaw };

    await lockSendRateLimitBuckets("EMAIL", "a@b.kr", "203.0.113.9", tx as never);

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(String(executeRaw.mock.calls[0]![0][0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(executeRaw.mock.calls[0]![1]).toBe("verification:target:EMAIL:a@b.kr");
    expect(executeRaw.mock.calls[1]![1]).toBe("verification:ip:203.0.113.9");
  });

  it("skips the IP bucket lock when the request IP is unavailable", async () => {
    const tx = { $executeRaw: executeRaw };

    await lockSendRateLimitBuckets("EMAIL", "a@b.kr", null, tx as never);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0]![1]).toBe("verification:target:EMAIL:a@b.kr");
  });

  it("expires pending rows and inserts using the supplied transaction client", async () => {
    const tx = {
      verificationCode: {
        updateMany,
        create,
      },
    };
    const now = new Date("2026-08-19T00:00:00.000Z");
    const expiresAt = new Date("2026-08-19T00:05:00.000Z");
    create.mockResolvedValueOnce({ id: "v1" });

    await expirePending("EMAIL", "a@b.kr", now, tx as never);
    await insertCode({
      channel: "EMAIL",
      target: "a@b.kr",
      codeHash: "hash",
      expiresAt,
      requestIp: "203.0.113.9",
      verifiedAt: now,
    }, tx as never);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        channel: "EMAIL",
        target: "a@b.kr",
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        channel: "EMAIL",
        target: "a@b.kr",
        codeHash: "hash",
        expiresAt,
        requestIp: "203.0.113.9",
        verifiedAt: now,
      },
    });
  });
});

describe("verification.repo.consume()", () => {
  it("claims only unconsumed verified proof rows and returns the claimed count", async () => {
    updateMany.mockResolvedValueOnce({ count: 2 });
    const now = new Date("2026-08-19T00:00:00.000Z");

    await expect(consume(["v1", "v2"], now)).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["v1", "v2"] },
        consumedAt: null,
        verifiedAt: { not: null },
      },
      data: { consumedAt: now },
    });
  });

  it("does not issue an update for an empty id list", async () => {
    await expect(consume([], new Date())).resolves.toBe(0);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
