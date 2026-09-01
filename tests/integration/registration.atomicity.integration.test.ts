import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { prisma } from "@/core/db/client";
import { coreMocks } from "../helpers/core-mocks";

const { recordAudit } = coreMocks("registration-atomicity-integration-test");

vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { completeRegistration } = await import(
  "@/modules/registration/registration.service"
);

const created = {
  inviteIds: [] as string[],
  userIds: [] as string[],
  userEmails: [] as string[],
  verificationIds: [] as string[],
  academicYears: [] as number[],
};

function inviteCode(): string {
  return `GBSW${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

describe("completeRegistration() — 가입 원자성", () => {
  afterEach(async () => {
    await prisma.verificationCode.deleteMany({
      where: { id: { in: created.verificationIds } },
    });
    await prisma.invite.deleteMany({ where: { id: { in: created.inviteIds } } });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: created.userIds } },
          { email: { in: created.userEmails } },
        ],
      },
    });
    if (created.academicYears.length > 0) {
      await prisma.academicYear.updateMany({ data: { isCurrent: false } });
      await prisma.academicYear.update({
        where: { year: 2026 },
        data: { isCurrent: true },
      });
      await prisma.schoolClass.deleteMany({
        where: { year: { in: created.academicYears } },
      });
      await prisma.academicYear.deleteMany({
        where: { year: { in: created.academicYears } },
      });
    }

    created.inviteIds = [];
    created.userIds = [];
    created.userEmails = [];
    created.verificationIds = [];
    created.academicYears = [];
    recordAudit.mockReset();
  });

  it("가입 완료 감사가 실패하면 계정·초대 소진·인증코드 소진이 함께 롤백된다", async () => {
    const creatorId = randomUUID();
    const inviteId = randomUUID();
    const emailVerificationId = randomUUID();
    const phoneVerificationId = randomUUID();
    const code = inviteCode();
    const email = `atomic-${randomUUID()}@example.invalid`;
    const phone = "010-7777-1001";
    const now = new Date();

    created.userIds.push(creatorId);
    created.userEmails.push(email);
    created.inviteIds.push(inviteId);
    created.verificationIds.push(emailVerificationId, phoneVerificationId);

    await prisma.user.create({
      data: {
        id: creatorId,
        name: "원자성 발급자",
        email: `atomic-creator-${creatorId}@example.invalid`,
        phone: "010-7777-1000",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    await prisma.invite.create({
      data: {
        id: inviteId,
        code,
        role: "ADMIN",
        status: "PENDING",
        metadata: { name: "원자성 가입자" },
        createdById: creatorId,
      },
    });
    await prisma.verificationCode.createMany({
      data: [
        {
          id: emailVerificationId,
          channel: "EMAIL",
          target: email,
          codeHash: "already-verified",
          expiresAt: new Date(now.getTime() + 60_000),
          verifiedAt: now,
        },
        {
          id: phoneVerificationId,
          channel: "PHONE",
          target: phone,
          codeHash: "already-verified",
          expiresAt: new Date(now.getTime() + 60_000),
          verifiedAt: now,
        },
      ],
    });

    recordAudit.mockRejectedValue(new Error("audit failed"));

    await expect(
      completeRegistration({
        code,
        name: "원자성 가입자",
        email,
        phone,
        password: "long-enough-password",
        confirmPassword: "long-enough-password",
      }),
    ).rejects.toThrow("audit failed");

    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    const user = await prisma.user.findUnique({ where: { email } });
    const consumed = await prisma.verificationCode.count({
      where: {
        id: { in: [emailVerificationId, phoneVerificationId] },
        consumedAt: { not: null },
      },
    });

    expect(invite).toMatchObject({
      status: "PENDING",
      usedById: null,
    });
    expect(user).toBeNull();
    expect(consumed).toBe(0);
  });

  it("학생 가입은 동시에 전환 완료된 이전 현재 학년도에 소속을 만들지 않는다", async () => {
    const fromYear = 8124;
    const toYear = 8125;
    const creatorId = randomUUID();
    const inviteId = randomUUID();
    const emailVerificationId = randomUUID();
    const phoneVerificationId = randomUUID();
    const code = inviteCode();
    const email = `year-race-${randomUUID()}@example.invalid`;
    const phone = "010-7777-2001";
    const now = new Date();

    created.academicYears.push(fromYear, toYear);
    created.userIds.push(creatorId);
    created.userEmails.push(email);
    created.inviteIds.push(inviteId);
    created.verificationIds.push(emailVerificationId, phoneVerificationId);

    await prisma.academicYear.createMany({
      data: [
        { year: fromYear, isCurrent: false },
        { year: toYear, isCurrent: false },
      ],
      skipDuplicates: true,
    });
    await prisma.academicYear.updateMany({ data: { isCurrent: false } });
    await prisma.academicYear.update({
      where: { year: fromYear },
      data: { isCurrent: true },
    });
    await prisma.user.create({
      data: {
        id: creatorId,
        name: "학년도 경합 발급자",
        email: `year-race-creator-${creatorId}@example.invalid`,
        phone: "010-7777-2000",
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    await prisma.invite.create({
      data: {
        id: inviteId,
        code,
        role: "STUDENT",
        status: "PENDING",
        metadata: {
          name: "학년도학생",
          birthDate: "2010-03-04",
          grade: 1,
          classNo: 2,
          number: 15,
        },
        createdById: creatorId,
      },
    });
    await prisma.verificationCode.createMany({
      data: [
        {
          id: emailVerificationId,
          channel: "EMAIL",
          target: email,
          codeHash: "already-verified",
          expiresAt: new Date(now.getTime() + 60_000),
          verifiedAt: now,
        },
        {
          id: phoneVerificationId,
          channel: "PHONE",
          target: phone,
          codeHash: "already-verified",
          expiresAt: new Date(now.getTime() + 60_000),
          verifiedAt: now,
        },
      ],
    });

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    let committed = false;

    try {
      await client.query("BEGIN");
      await client.query('SELECT "year" FROM "AcademicYear" ORDER BY "year" FOR UPDATE');
      await client.query('UPDATE "AcademicYear" SET "isCurrent" = false WHERE "isCurrent"');
      await client.query('UPDATE "AcademicYear" SET "isCurrent" = true WHERE "year" = $1', [
        toYear,
      ]);

      const registration = completeRegistration({
        code,
        name: "학년도학생",
        birthDate: "2010-03-04",
        email,
        phone,
        password: "long-enough-password",
        confirmPassword: "long-enough-password",
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      await client.query("COMMIT");
      committed = true;
      await expect(registration).resolves.toEqual({ role: "STUDENT" });
    } finally {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        studentProfile: {
          select: {
            enrollments: { select: { year: true } },
          },
        },
      },
    });

    expect(user?.studentProfile?.enrollments).toEqual([{ year: toYear }]);
    expect(
      await prisma.enrollment.count({
        where: { studentProfile: { user: { email } }, year: fromYear },
      }),
    ).toBe(0);
  });
});
