import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

/*
 * 이 파일만 mock 모드를 쓰지 않는다. 발송이 즉시 끝나면 예약 행이 살아 있는
 * 시간이 0에 수렴해 이 결함이 재현되지 않는다 — 실제 SMTP·문자는 수백 ms에서
 * 수 초가 걸리고, 그 창이 곧 공격 창이다.
 */
const { readRequestContext, sendVerification } = vi.hoisted(() => ({
  readRequestContext: vi.fn(),
  sendVerification: vi.fn(),
}));

vi.mock("@/core/audit/request-context", () => ({ readRequestContext }));
vi.mock("@/modules/verification/verification.sender", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendVerification,
}));

import {
  requestCode,
  VerificationError,
} from "@/modules/verification/verification.service";

/* 발송이 끝나기 전에 다음 요청이 들어오도록, 발송보다 짧은 간격으로 쏜다. */
const SEND_MS = 400;
const STAGGER_MS = 60;

const MAX_SENDS_PER_HOUR = 5;
const MAX_SENDS_PER_HOUR_PER_INVITE = 10;

const targets: string[] = [];
const inviteIds: string[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freshTarget(label: string): string {
  const target = `itest-${label}-${randomUUID()}@example.invalid`;
  targets.push(target);
  return target;
}

/*
 * 시차를 두고 쏘므로 거부가 마지막 await보다 먼저 온다 — 밀어 넣는 자리에서
 * 바로 결과로 바꿔 두지 않으면 처리되지 않은 거부로 뜬다.
 */
function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason: unknown) => ({ status: "rejected", reason }) as const,
  );
}

function settled<T>(results: PromiseSettledResult<T>[]) {
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  return {
    fulfilled: results.length - rejected.length,
    rejected,
    reasons: rejected.map((result) => String(result.reason?.message ?? result.reason)),
  };
}

describe("발송 중인 인증 예약 행", () => {
  beforeEach(() => {
    readRequestContext.mockResolvedValue({ ip: null, userAgent: null });
    sendVerification.mockImplementation(() => sleep(SEND_MS));
  });

  afterEach(async () => {
    await prisma.verificationCode.deleteMany({
      where: {
        OR: [{ target: { in: targets } }, { inviteId: { in: inviteIds } }],
      },
    });
    targets.length = 0;
    inviteIds.length = 0;
    readRequestContext.mockReset();
    sendVerification.mockReset();
  });

  /*
   * 원래 결함이다. 예약 행은 expiresAt = createdAt으로 태어나는데 청소가
   * expiresAt <= now만 봤으므로, 발송이 끝나기 전에 들어온 다음 요청이 그 행을
   * 지웠다. 지워진 행은 대상·초대·IP 세 한도의 계산에서 모두 사라지므로,
   * 발송보다 빠르게 반복해 부르면 문자를 무제한으로 보낼 수 있었다.
   */
  it("발송보다 빠르게 이어 부르면 대상 한도에서 막힌다", async () => {
    const target = freshTarget("stagger");

    const attempts: Promise<PromiseSettledResult<unknown>>[] = [];
    for (let i = 0; i < MAX_SENDS_PER_HOUR + 1; i += 1) {
      attempts.push(settle(requestCode("EMAIL", target)));
      await sleep(STAGGER_MS);
    }

    const { fulfilled, rejected, reasons } = settled(await Promise.all(attempts));

    expect(fulfilled, `거부 사유: ${reasons.join(" · ")}`).toBe(
      MAX_SENDS_PER_HOUR,
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(VerificationError);
    expect(rejected[0]!.reason.message).toContain("너무 많이");

    // 막힌 요청은 발송까지 가지 않는다 — 이 결함의 값은 문자 요금이다.
    expect(sendVerification).toHaveBeenCalledTimes(MAX_SENDS_PER_HOUR);
    await expect(
      prisma.verificationCode.count({ where: { target } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR);
  });

  // 발송에 성공한 코드가 확인 대상으로 남지 못하면 학생은 받은 번호를 넣을 수 없다.
  it("먼저 보낸 코드가 다음 요청 때문에 사라지지 않는다", async () => {
    const target = freshTarget("survive");

    const first = requestCode("EMAIL", target);
    await sleep(STAGGER_MS);
    const second = requestCode("EMAIL", target);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    for (const challengeId of [firstResult.challengeId, secondResult.challengeId]) {
      await expect(
        prisma.verificationCode.count({ where: { challengeId } }),
      ).resolves.toBe(1);
    }
  });

  /*
   * 초대는 발송을 허가하는 유일한 열쇠다. 잠금이 대상과 IP에만 걸려 있으면
   * 수신처를 바꾼 병렬 요청끼리 서로를 보지 못해 초대 예산이 그대로 넘어간다.
   */
  it("한 초대로 수신처를 바꿔 가며 병렬로 불러도 초대 예산을 넘지 못한다", async () => {
    const inviteId = `itest-invite-${randomUUID()}`;
    inviteIds.push(inviteId);

    const batch = Array.from(
      { length: MAX_SENDS_PER_HOUR_PER_INVITE + 1 },
      () => freshTarget("invite"),
    );

    const { fulfilled, reasons } = settled(
      await Promise.allSettled(
        batch.map((target) => requestCode("EMAIL", target, inviteId)),
      ),
    );

    expect(fulfilled, `거부 사유: ${reasons.join(" · ")}`).toBe(
      MAX_SENDS_PER_HOUR_PER_INVITE,
    );
    expect(reasons.join(" ")).toContain("너무 많이");
    await expect(
      prisma.verificationCode.count({ where: { inviteId } }),
    ).resolves.toBe(MAX_SENDS_PER_HOUR_PER_INVITE);
  });

  // 유예는 발송을 기다리는 행만 살린다. 프로세스가 죽어 남은 고아는 여전히 치운다.
  it("유예를 지난 고아 예약 행은 한도를 차지하지 않는다", async () => {
    const target = freshTarget("orphan");
    const stale = new Date(Date.now() - 10 * 60_000);

    for (let i = 0; i < MAX_SENDS_PER_HOUR; i += 1) {
      await prisma.verificationCode.create({
        data: {
          challengeId: `itest-orphan-${randomUUID()}`,
          channel: "EMAIL",
          target,
          codeHash: `orphan-${i}`,
          // 예약 행의 표식 — 활성화되지 못해 만료 시각이 생성 시각과 같다.
          createdAt: stale,
          expiresAt: stale,
        },
      });
    }

    await expect(requestCode("EMAIL", target)).resolves.toEqual({
      challengeId: expect.any(String),
    });
    await expect(
      prisma.verificationCode.count({ where: { target } }),
    ).resolves.toBe(1);
  });
});
