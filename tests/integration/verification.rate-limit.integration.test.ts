import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

const { readRequestContext } = vi.hoisted(() => ({
  readRequestContext: vi.fn(),
}));

vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

import {
  createTemporaryVerifiedProof,
  VerificationError,
} from "@/modules/verification/verification.service";

const targets: string[] = [];
const requestIps: string[] = [];

describe("createTemporaryVerifiedProof() — rate limits", () => {
  afterEach(async () => {
    await prisma.verificationCode.deleteMany({
      where: {
        OR: [
          { target: { in: targets } },
          { requestIp: { in: requestIps } },
        ],
      },
    });
    targets.length = 0;
    requestIps.length = 0;
    readRequestContext.mockReset();
  });

  it("keeps immediate verification working below the target limit", async () => {
    const target = `itest-ok-${randomUUID()}@example.invalid`;
    targets.push(target);
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });

    await expect(createTemporaryVerifiedProof("EMAIL", target)).resolves.toEqual({
      id: expect.any(String),
    });

    const row = await prisma.verificationCode.findFirst({
      where: { target, verifiedAt: { not: null }, consumedAt: null },
    });
    expect(row).not.toBeNull();
  });

  it("allows only five concurrent immediate proofs per target per hour", async () => {
    const target = `itest-limit-${randomUUID()}@example.invalid`;
    targets.push(target);
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createTemporaryVerifiedProof("EMAIL", target)),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(VerificationError);
    expect(rejected[0]!.reason.message).toContain("너무 많이");

    await expect(
      prisma.verificationCode.count({ where: { target } }),
    ).resolves.toBe(5);
  });

  it("allows only twenty concurrent immediate proofs per request IP per hour", async () => {
    const requestIp = `2001:db8::${randomUUID().replaceAll("-", "").slice(0, 4)}`;
    const batchTargets = Array.from(
      { length: 21 },
      () => `itest-ip-${randomUUID()}@example.invalid`,
    );
    targets.push(...batchTargets);
    requestIps.push(requestIp);
    readRequestContext.mockResolvedValue({ ip: requestIp, userAgent: null });

    const results = await Promise.allSettled(
      batchTargets.map((target) => createTemporaryVerifiedProof("EMAIL", target)),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(20);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(VerificationError);
    expect(rejected[0]!.reason.message).toContain("너무 많이");

    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(20);
  });
});
