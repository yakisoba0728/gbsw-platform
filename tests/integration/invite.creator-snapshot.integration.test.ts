import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { deletePermanently } from "@/modules/admin-users/admin-user.repo";

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const creatorId = `invite-snapshot-creator-${suffix}`;
const creatorName = "초대 스냅샷 발급자";
const inviteCode = `SNAP-${suffix}`;

describe("Invite 발급자 이름 스냅샷", () => {
  afterAll(async () => {
    await prisma.invite.deleteMany({ where: { code: inviteCode } });
    await prisma.user.deleteMany({ where: { id: creatorId } });
  });

  it("발급자 계정을 영구 삭제해도 PENDING 초대와 발급 당시 이름은 남는다", async () => {
    await prisma.user.create({
      data: {
        id: creatorId,
        name: creatorName,
        email: `${creatorId}@example.invalid`,
        phone: `010-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "ADMIN",
        status: "ACTIVE",
        // 완전 삭제는 삭제 표시된 계정만 대상으로 한다.
        deletedAt: new Date(),
      },
    });
    await prisma.invite.create({
      data: {
        code: inviteCode,
        role: "ADMIN",
        status: "PENDING",
        metadata: { name: "삭제 뒤에도 쓸 가입자" },
        createdById: creatorId,
        createdByName: creatorName,
      },
    });

    // 트랜잭션 경계는 호출자가 소유한다 — 초대 삭제와 사용자 삭제가 함께 되돌려져야 한다.
    await expect(
      prisma.$transaction((tx) => deletePermanently(creatorId, creatorName, tx)),
    ).resolves.toBe(true);

    await expect(
      prisma.invite.findUnique({
        where: { code: inviteCode },
        select: {
          status: true,
          createdById: true,
          createdByName: true,
        },
      }),
    ).resolves.toEqual({
      status: "PENDING",
      createdById: null,
      createdByName: creatorName,
    });
  });

  // repo가 자체 트랜잭션을 열면 사용자 삭제가 0건이어도 초대 삭제만 커밋된다.
  // 호출자의 트랜잭션 하나를 쓰므로 실패는 초대까지 함께 되돌린다.
  it("사용자 삭제가 조건에 걸리면 초대 삭제도 함께 되돌아간다", async () => {
    const failId = `${creatorId}-fail`;
    const failCode = `${inviteCode}-FAIL`;
    await prisma.user.create({
      data: {
        id: failId,
        name: "롤백 검증 발급자",
        email: `${failId}@example.invalid`,
        phone: `019-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "ADMIN",
        status: "ACTIVE",
        deletedAt: new Date(),
      },
    });
    await prisma.invite.create({
      data: {
        code: failCode,
        role: "ADMIN",
        status: "PENDING",
        createdById: failId,
        createdByName: "롤백 검증 발급자",
        usedById: failId,
      },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        // 이름이 어긋나 삭제는 0건이 된다.
        const deleted = await deletePermanently(failId, "틀린 이름", tx);
        if (!deleted) throw new Error("ROLLBACK");
        return deleted;
      }),
    ).rejects.toThrow("ROLLBACK");

    await expect(
      prisma.invite.findUnique({ where: { code: failCode }, select: { usedById: true } }),
    ).resolves.toEqual({ usedById: failId });
    await expect(
      prisma.user.findUnique({ where: { id: failId }, select: { id: true } }),
    ).resolves.toEqual({ id: failId });

    await prisma.invite.deleteMany({ where: { code: failCode } });
    await prisma.user.deleteMany({ where: { id: failId } });
  });
});
