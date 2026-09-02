import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import {
  completeAdminRegistration,
  InviteRaceError,
  type RegistrationAccount,
} from "@/modules/registration/registration.repo";

/**
 * I7 — 초대코드 동시 사용 방어를 실 Postgres(gbsw_test)에 대고 검증한다.
 *
 * registration.repo.ts의 consumeInvite()는 `status: "PENDING"` 조건이 붙은
 * updateMany라 동시 요청 중 count 1을 받는 쪽이 반드시 하나뿐이라고 주석에
 * 적혀 있다 — 이건 Postgres의 행 잠금(두 번째 트랜잭션이 첫 번째가 커밋될
 * 때까지 블록됐다가 조건을 다시 평가) 동작에 기대는 것이라, $transaction을
 * `(fn) => fn(tx)`로 흉내 내는 목으로는 절대 검증할 수 없다.
 */

const inviteId = randomUUID();
const inviteCode = `ITSTRACE${randomUUID().slice(0, 6).toUpperCase()}`;
const creatorId = randomUUID();

function testAccount(label: string): RegistrationAccount {
  const userId = randomUUID();
  return {
    userId,
    accountId: randomUUID(),
    name: `동시가입${label}`,
    email: `itest-race-${label}-${userId}@example.invalid`,
    phone: label === "A" ? "010-0000-2001" : "010-0000-2002",
    passwordHash: "not-a-real-hash",
  };
}

describe("completeAdminRegistration() — 초대코드 동시 소진 (I7)", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: creatorId,
        name: "통합테스트 발급자",
        email: `itest-creator-${creatorId}@example.invalid`,
        phone: "010-0000-2099",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    await prisma.invite.create({
      data: {
        id: inviteId,
        code: inviteCode,
        role: "ADMIN",
        status: "PENDING",
        metadata: { name: "동시가입 테스트" },
        createdById: creatorId,
        createdByName: "통합테스트 발급자",
      },
    });
  });

  afterAll(async () => {
    // 승자의 계정은 테스트 본문에서 미리 지운다 — 여기서는 초대·발급자만 정리.
    await prisma.invite.deleteMany({ where: { id: inviteId } });
    await prisma.user.deleteMany({ where: { id: creatorId } });
  });

  it("동시에 두 번 소진을 시도하면 하나만 성공하고, 진 쪽 계정은 흔적 없이 사라진다", async () => {
    const accountA = testAccount("A");
    const accountB = testAccount("B");

    // Promise.allSettled는 입력 순서를 그대로 보존한다 — results[0]이 항상
    // accountA의 결과다. "먼저 완료된 쪽"이 아니라 "어느 쪽이 이겼는지"를
    // 안정적으로 식별하는 데 쓴다.
    const [resultA, resultB] = await Promise.allSettled([
      completeAdminRegistration(inviteId, accountA),
      completeAdminRegistration(inviteId, accountB),
    ]);

    const outcomes = [resultA.status, resultB.status];
    expect(outcomes.filter((s) => s === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((s) => s === "rejected")).toHaveLength(1);

    const winnerAccount = resultA.status === "fulfilled" ? accountA : accountB;
    const loserAccount = resultA.status === "fulfilled" ? accountB : accountA;
    const loserResult = resultA.status === "rejected" ? resultA : (resultB as PromiseRejectedResult);
    expect(loserResult.reason).toBeInstanceOf(InviteRaceError);

    const winnerUser = await prisma.user.findUnique({ where: { id: winnerAccount.userId } });
    expect(winnerUser).not.toBeNull();

    // 진 쪽은 트랜잭션이 통째로 롤백돼 계정이 아예 생기지 않아야 한다 —
    // "반쯤 만들어진 계정"이 남으면 안 된다.
    const loserUser = await prisma.user.findUnique({ where: { id: loserAccount.userId } });
    expect(loserUser).toBeNull();

    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    expect(invite?.status).toBe("USED");
    expect(invite?.usedById).toBe(winnerAccount.userId);

    // 승자의 계정 정리 (Account는 Cascade로 함께 사라진다).
    await prisma.user.deleteMany({ where: { id: winnerAccount.userId } });
  });
});
