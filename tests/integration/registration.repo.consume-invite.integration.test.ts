import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import {
  completeAdminRegistration,
  InviteRaceError,
  type RegistrationAccount,
} from "@/modules/registration/registration.repo";

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
    await prisma.invite.deleteMany({ where: { id: inviteId } });
    await prisma.user.deleteMany({ where: { id: creatorId } });
  });

  it("동시에 두 번 소진을 시도하면 하나만 성공하고, 진 쪽 계정은 흔적 없이 사라진다", async () => {
    const accountA = testAccount("A");
    const accountB = testAccount("B");

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

    const loserUser = await prisma.user.findUnique({ where: { id: loserAccount.userId } });
    expect(loserUser).toBeNull();

    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    expect(invite?.status).toBe("USED");
    expect(invite?.usedById).toBe(winnerAccount.userId);

    await prisma.user.deleteMany({ where: { id: winnerAccount.userId } });
  });
});
