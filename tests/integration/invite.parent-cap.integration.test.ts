import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import {
  createParentInviteFor,
  InviteError,
  MAX_ACTIVE_PARENT_INVITES,
} from "@/modules/invites/invite.service";
import { user } from "../helpers/session";

vi.mock("server-only", () => ({}));

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const adminId = `invite-cap-admin-${suffix}`;
const studentUserId = `invite-cap-student-${suffix}`;
let studentProfileId = "";

const actor = user("ADMIN", adminId, {
  name: "초대 상한 관리자",
  email: `invite-cap-admin-${suffix}@example.invalid`,
});

describe("학부모 초대 활성 상한 경쟁", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: adminId,
        name: actor.name,
        email: actor.email,
        phone: "010-8111-0001",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    const student = await prisma.user.create({
      data: {
        id: studentUserId,
        name: "초대 상한 학생",
        email: `invite-cap-student-${suffix}@example.invalid`,
        phone: "010-8111-0002",
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          create: {
            studentCode: `CAP${suffix}`,
            birthDate: new Date("2010-01-01T00:00:00+09:00"),
          },
        },
      },
      select: { studentProfile: { select: { id: true } } },
    });
    studentProfileId = student.studentProfile!.id;

    await prisma.invite.createMany({
      data: Array.from(
        { length: MAX_ACTIVE_PARENT_INVITES - 1 },
        (_, index) => ({
          code: `CAP-${suffix}-${index}`,
          role: "PARENT",
          status: "PENDING",
          metadata: { name: `기존 보호자 ${index}` },
          studentId: studentProfileId,
          createdById: adminId,
          createdByName: actor.name,
        }),
      ),
    });
  });

  afterAll(async () => {
    await prisma.invite.deleteMany({ where: { createdById: adminId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.user.deleteMany({
      where: { id: { in: [studentUserId, adminId] } },
    });
  });

  it("한도 바로 아래에서 병렬 발급해도 하나만 성공해 최종 2개다", async () => {
    const results = await Promise.allSettled([
      createParentInviteFor(actor, {
        studentId: studentProfileId,
        name: "병렬 보호자 A",
      }),
      createParentInviteFor(actor, {
        studentId: studentProfileId,
        name: "병렬 보호자 B",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(InviteError);
    expect((rejected?.reason as Error).message).toBe("TOO_MANY_ACTIVE_INVITES");

    const active = await prisma.invite.count({
      where: {
        studentId: studentProfileId,
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    expect(active).toBe(MAX_ACTIVE_PARENT_INVITES);
  });
});
