import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const executeRaw = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    $executeRaw: executeRaw,
    verificationCode: {
      count,
      updateMany,
      update,
      create,
      findFirst,
      findUnique,
    },
  },
}));

const {
  consume,
  countRecentSends,
  countRecentSendsByIp,
  deleteStaleReservations,
  expirePending,
  hasNewerActivatedCode,
  findVerified,
  insertCode,
  LEGACY_TEMPORARY_BYPASS_HASH,
  lockSendRateLimitBuckets,
} = await import("@/modules/verification/verification.repo");

beforeEach(() => {
  count.mockReset();
  executeRaw.mockReset();
  updateMany.mockReset();
  update.mockReset();
  create.mockReset();
  findFirst.mockReset();
  findUnique.mockReset();
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

  it("detects an activated code created after the current request", async () => {
    const createdAt = new Date("2026-08-19T00:00:00.000Z");
    const now = new Date("2026-08-19T00:01:00.000Z");
    findUnique.mockResolvedValueOnce({ createdAt });
    findFirst.mockResolvedValueOnce({ id: "v2" });

    await expect(
      hasNewerActivatedCode("EMAIL", "a@b.kr", "v1", now),
    ).resolves.toBe(true);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        channel: "EMAIL",
        target: "a@b.kr",
        expiresAt: { gt: now },
        OR: [
          { createdAt: { gt: createdAt } },
          { createdAt, id: { gt: "v1" } },
        ],
      },
      select: { id: true },
    });
  });
});

describe("verification.repo.deleteStaleReservations()", () => {
  it("대상 기준으로 활성화되지 못한 예약 행만 지운다 — 만료된 정상 코드는 남긴다", async () => {
    const now = new Date("2026-08-19T00:10:00.000Z");
    const tx = { $executeRaw: executeRaw };

    await deleteStaleReservations("EMAIL", "a@b.kr", now, tx as never);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const args = executeRaw.mock.calls[0]!;
    const sql = (args[0] as unknown[]).join("");
    expect(sql).toContain('DELETE FROM "VerificationCode"');
    expect(sql).toContain('"consumedAt" IS NULL');
    expect(sql).toContain('"verifiedAt" IS NULL');
    // 활성화된 적 없는 행만 — expiresAt이 createdAt보다 뒤인 만료 코드는 한도 기록으로 남는다.
    expect(sql).toContain('"expiresAt" <= "createdAt"');
    expect(args).toContain("EMAIL");
    expect(args).toContain("a@b.kr");
    expect(args).toContain(now);
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
        codeHash: { not: LEGACY_TEMPORARY_BYPASS_HASH },
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

describe("verification.repo.findVerified()", () => {
  it("이전 버전의 즉시 확인 bypass proof를 영구 제외한다", async () => {
    const cutoff = new Date("2026-08-19T00:00:00.000Z");
    findFirst.mockResolvedValueOnce(null);

    await findVerified("EMAIL", "a@b.kr", cutoff);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        channel: "EMAIL",
        target: "a@b.kr",
        consumedAt: null,
        codeHash: { not: LEGACY_TEMPORARY_BYPASS_HASH },
        verifiedAt: { gte: cutoff },
      },
      orderBy: { verifiedAt: "desc" },
    });
  });
});
