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

  /**
   * IP 버킷은 20건이다. **21개를 한꺼번에 던져 「정확히 20개 성공」을 세지 않는다** —
   * 21개가 동시에 트랜잭션을 열면 연결 풀이 그만큼 없어서, 늦게 줄 선 몇 개가
   * 제한이 아니라 `maxWait`에 걸려 밀린다. 그 수는 기계 사정에 따라 바뀌므로
   * 세면 테스트가 불안정해진다 (실제로 서너 번에 한 번 16으로 떨어졌다).
   *
   * 붙들 규칙은 두 가지고 둘 다 개수 세기와 무관하다.
   * 1. **넘치지 않는다** — 무슨 일이 있어도 20건을 넘겨 만들지 않는다.
   *    잠금이 풀리면 21건이 되고, 그때 이 단언이 깨진다.
   * 2. **한도에 닿으면 그 이유로 거부한다** — 채운 뒤 한 번 더 부르면
   *    VerificationError이고 문구가 「너무 많이」다.
   */
  it("allows only twenty immediate proofs per request IP per hour", async () => {
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

    // 거부된 것이 있다면 이유는 언제나 한도다 — 다른 이유로 죽고 있으면 잡는다.
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(VerificationError);
        expect(result.reason.message).toContain("너무 많이");
      }
    }

    // 1. 넘치지 않는다.
    const made = await prisma.verificationCode.count({ where: { requestIp } });
    expect(made).toBeLessThanOrEqual(20);

    // 남은 자리를 하나씩 채운다. 순차라 풀 경합이 없다.
    for (let i = made; i < 20; i += 1) {
      const target = `itest-ip-fill-${randomUUID()}@example.invalid`;
      targets.push(target);
      await createTemporaryVerifiedProof("EMAIL", target);
    }
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(20);

    // 2. 스물한 번째는 한도로 거부된다.
    const overflow = `itest-ip-over-${randomUUID()}@example.invalid`;
    targets.push(overflow);
    await expect(createTemporaryVerifiedProof("EMAIL", overflow)).rejects.toThrow(
      "너무 많이",
    );
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(20);
  });
});
