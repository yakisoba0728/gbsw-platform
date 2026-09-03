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

    await expect(deletePermanently(creatorId, creatorName)).resolves.toBe(true);

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
});
