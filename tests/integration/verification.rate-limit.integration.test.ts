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
  MAX_SENDS_PER_HOUR_PER_IP,
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

  it("allows only MAX_SENDS_PER_HOUR_PER_IP immediate proofs per request IP per hour", async () => {
    const requestIp = `2001:db8::${randomUUID().replaceAll("-", "").slice(0, 4)}`;
    const batchTargets = Array.from(
      { length: MAX_SENDS_PER_HOUR_PER_IP + 1 },
      () => `itest-ip-${randomUUID()}@example.invalid`,
    );
    targets.push(...batchTargets);
    requestIps.push(requestIp);
    readRequestContext.mockResolvedValue({ ip: requestIp, userAgent: null });

    const results = await Promise.allSettled(
      batchTargets.map((target) => createTemporaryVerifiedProof("EMAIL", target)),
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    for (const result of rejected) {
      if (result.reason instanceof VerificationError) {
        expect(result.reason.message).toContain("너무 많이");
      }
    }
    const infrastructureRejections = rejected.filter(
      (result) => !(result.reason instanceof VerificationError),
    ).length;

    const made = await prisma.verificationCode.count({ where: { requestIp } });
    expect(
      made,
      `인프라 거부 ${infrastructureRejections}건 후에도 IP 한도를 넘으면 안 됩니다.`,
    ).toBeLessThanOrEqual(MAX_SENDS_PER_HOUR_PER_IP);

    for (let i = made; i < MAX_SENDS_PER_HOUR_PER_IP; i += 1) {
      const target = `itest-ip-fill-${randomUUID()}@example.invalid`;
      targets.push(target);
      await createTemporaryVerifiedProof("EMAIL", target);
    }
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_IP);

    const overflow = `itest-ip-over-${randomUUID()}@example.invalid`;
    targets.push(overflow);
    await expect(createTemporaryVerifiedProof("EMAIL", overflow)).rejects.toThrow(
      "너무 많이",
    );
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_IP);
  });
});
