import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";
import { prisma } from "@/core/db/client";
import {
  listMyParentInvites,
  revokeInvite,
} from "@/modules/invites/invite.service";
import { user } from "../helpers/session";

vi.mock("server-only", () => ({}));

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const studentUserId = `invite-owner-student-${suffix}`;
const adminUserId = `invite-owner-admin-${suffix}`;
let studentProfileId = "";

const student = user("STUDENT", studentUserId, {
  name: "초대 소유권 학생",
  email: `invite-owner-student-${suffix}@example.invalid`,
});

const codes = {
  mine: `OWN-MINE-${suffix}`,
  admin: `OWN-ADMIN-${suffix}`,
  wrongRole: `OWN-ROLE-${suffix}`,
};

describe("학생 학부모 초대 소유권", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: adminUserId,
        name: "초대 소유권 관리자",
        email: `invite-owner-admin-${suffix}@example.invalid`,
        phone: `010-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    const createdStudent = await prisma.user.create({
      data: {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: `011-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`,
        role: "STUDENT",
        status: "ACTIVE",
        studentProfile: {
          create: {
            studentCode: `OWN${suffix}`,
            birthDate: new Date("2010-01-01T00:00:00+09:00"),
          },
        },
      },
      select: { studentProfile: { select: { id: true } } },
    });
    studentProfileId = createdStudent.studentProfile!.id;

    await prisma.invite.createMany({
      data: [
        {
          code: codes.mine,
          role: "PARENT",
          metadata: { name: "학생이 만든 보호자" },
          studentId: studentProfileId,
          createdById: student.id,
        },
        {
          code: codes.admin,
          role: "PARENT",
          metadata: { name: "교사가 만든 보호자" },
          studentId: studentProfileId,
          createdById: adminUserId,
        },
        {
          code: codes.wrongRole,
          role: "STUDENT",
          metadata: { name: "역할이 다른 코드" },
          studentId: studentProfileId,
          createdById: student.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.invite.deleteMany({
      where: { createdById: { in: [student.id, adminUserId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: [student.id, adminUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [student.id, adminUserId] } },
    });
  });

  it("내 화면에는 내게 귀속된 PARENT 코드가 발급자와 무관하게 보인다", async () => {
    const visible = await listMyParentInvites(student);

    expect(visible.map((invite) => invite.code)).toHaveLength(2);
    expect(visible.map((invite) => invite.code)).toEqual(
      expect.arrayContaining([codes.mine, codes.admin]),
    );
  });

  it("교사가 같은 학생에게 만든 PARENT 코드도 학생이 폐기할 수 있다", async () => {
    const invite = await prisma.invite.findUniqueOrThrow({
      where: { code: codes.admin },
      select: { id: true },
    });

    await revokeInvite(student, { inviteId: invite.id, reason: "다시 발급" });

    await expect(
      prisma.invite.findUniqueOrThrow({
        where: { id: invite.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "REVOKED" });
  });

  it("내가 만든 코드라도 PARENT 역할이 아니면 폐기할 수 없다", async () => {
    const invite = await prisma.invite.findUniqueOrThrow({
      where: { code: codes.wrongRole },
      select: { id: true },
    });

    await expect(
      revokeInvite(student, { inviteId: invite.id, reason: "역할이 다름" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("내가 만든 PARENT 코드는 폐기할 수 있다", async () => {
    const invite = await prisma.invite.findUniqueOrThrow({
      where: { code: codes.mine },
      select: { id: true },
    });

    await revokeInvite(student, { inviteId: invite.id, reason: "다시 발급" });

    const visible = await listMyParentInvites(student);
    expect(visible).toHaveLength(2);
    expect(visible.find((item) => item.code === codes.mine)).toMatchObject({
      status: "REVOKED",
    });
  });
});
