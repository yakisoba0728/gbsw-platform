import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

const { readRequestContext } = vi.hoisted(() => ({
  readRequestContext: vi.fn(),
}));

vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));

import {
  confirmCode,
  requestCode,
  requireVerified,
  VerificationError,
  MAX_SENDS_PER_HOUR_PER_IP,
} from "@/modules/verification/verification.service";

const targets: string[] = [];
const requestIps: string[] = [];

describe("requestCode() — rate limits", () => {
  beforeEach(() => {
    vi.stubEnv("VERIFICATION_MOCK", "true");
  });

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
    vi.unstubAllEnvs();
  });

  it("creates an unverified code below the target limit", async () => {
    const target = `itest-ok-${randomUUID()}@example.invalid`;
    targets.push(target);
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });

    await expect(requestCode("EMAIL", target)).resolves.toEqual({
      mockCode: expect.stringMatching(/^\d{6}$/),
    });

    const row = await prisma.verificationCode.findFirst({
      where: { target, verifiedAt: null, consumedAt: null },
    });
    expect(row).not.toBeNull();
  });

  it("배포 전에 생성된 즉시 확인 proof는 실제 확인으로 인정하지 않는다", async () => {
    const target = `itest-legacy-${randomUUID()}@example.invalid`;
    targets.push(target);
    await prisma.verificationCode.create({
      data: {
        channel: "EMAIL",
        target,
        codeHash: "temporary-verification-bypass",
        expiresAt: new Date(Date.now() + 30 * 60_000),
        verifiedAt: new Date(),
      },
    });

    await expect(requireVerified("EMAIL", target)).rejects.toThrow(
      "이메일 인증",
    );
  });

  it("병렬 오답도 다섯 번까지만 처리하고 코드를 만료시킨다", async () => {
    const target = `itest-confirm-${randomUUID()}@example.invalid`;
    targets.push(target);
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });
    const { mockCode } = await requestCode("EMAIL", target);
    const wrongCode = mockCode === "000000" ? "000001" : "000000";

    await Promise.allSettled(
      Array.from({ length: 40 }, () => confirmCode("EMAIL", target, wrongCode)),
    );

    const row = await prisma.verificationCode.findFirst({ where: { target } });
    expect(row?.attempts).toBe(5);
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("allows only five concurrent sends per target per hour", async () => {
    const target = `itest-limit-${randomUUID()}@example.invalid`;
    targets.push(target);
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => requestCode("EMAIL", target)),
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

  it("allows only MAX_SENDS_PER_HOUR_PER_IP sends per request IP per hour", async () => {
    const requestIp = `2001:db8::${randomUUID().replaceAll("-", "").slice(0, 4)}`;
    const batchTargets = Array.from(
      { length: MAX_SENDS_PER_HOUR_PER_IP + 1 },
      () => `itest-ip-${randomUUID()}@example.invalid`,
    );
    targets.push(...batchTargets);
    requestIps.push(requestIp);
    readRequestContext.mockResolvedValue({ ip: requestIp, userAgent: null });

    const results = await Promise.allSettled(
      batchTargets.map((target) => requestCode("EMAIL", target)),
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
      await requestCode("EMAIL", target);
    }
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_IP);

    const overflow = `itest-ip-over-${randomUUID()}@example.invalid`;
    targets.push(overflow);
    await expect(requestCode("EMAIL", overflow)).rejects.toThrow(
      "너무 많이",
    );
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_IP);
  });
});
