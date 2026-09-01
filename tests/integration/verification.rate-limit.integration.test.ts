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

  /**
   * IP 버킷은 `MAX_SENDS_PER_HOUR_PER_IP`건이다. **한도+1을 한꺼번에 던져
   * 「정확히 한도만큼 성공」을 세지 않는다** — 그만큼이 동시에 트랜잭션을 열면
   * 연결 풀이 모자라, 늦게 줄 선 몇 개가
   * 제한이 아니라 `maxWait`에 걸려 밀린다. 그 수는 기계 사정에 따라 바뀌므로
   * 세면 테스트가 불안정해진다 (실제로 서너 번에 한 번 16으로 떨어졌다).
   *
   * 붙들 규칙은 두 가지고 둘 다 개수 세기와 무관하다.
   * 1. **넘치지 않는다** — 무슨 일이 있어도 한도를 넘겨 만들지 않는다.
   *    잠금이 풀리면 한도+1이 되고, 그때 이 단언이 깨진다.
   * 2. **한도에 닿으면 그 이유로 거부한다** — 채운 뒤 한 번 더 부르면
   *    VerificationError이고 문구가 「너무 많이」다.
   */
  it("allows only MAX_SENDS_PER_HOUR_PER_IP immediate proofs per request IP per hour", async () => {
    const requestIp = `2001:db8::${randomUUID().replaceAll("-", "").slice(0, 4)}`;
    // 한도를 막 넘기는 만큼만 동시에 던진다 — 더 던져도 배우는 것이 없고 풀만 마른다.
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

    // 한도 거부로 분류된 것의 문구만 검사한다. 나머지 거부는 느린 CI에서
    // 커넥션 풀 maxWait에 걸린 인프라 실패일 수 있어 한도 회귀로 분류하지 않는다.
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

    // 1. 넘치지 않는다.
    const made = await prisma.verificationCode.count({ where: { requestIp } });
    expect(
      made,
      `인프라 거부 ${infrastructureRejections}건 후에도 IP 한도를 넘으면 안 됩니다.`,
    ).toBeLessThanOrEqual(MAX_SENDS_PER_HOUR_PER_IP);

    // 남은 자리를 하나씩 채운다. 순차라 풀 경합이 없다.
    for (let i = made; i < MAX_SENDS_PER_HOUR_PER_IP; i += 1) {
      const target = `itest-ip-fill-${randomUUID()}@example.invalid`;
      targets.push(target);
      await createTemporaryVerifiedProof("EMAIL", target);
    }
    await expect(
      prisma.verificationCode.count({ where: { requestIp } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_IP);

    // 2. 한도를 넘는 다음 한 건은 그 이유로 거부된다.
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
