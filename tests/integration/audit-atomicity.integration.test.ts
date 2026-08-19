import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "@/core/audit/audit";
import { prisma, withTransaction } from "@/core/db/client";

const TEST_YEAR = 8111;

describe("감사 로그 원자성", () => {
  beforeAll(async () => {
    await prisma.academicYear.create({
      data: { year: TEST_YEAR, isCurrent: false },
    });
  });

  afterAll(async () => {
    await prisma.academicYear.deleteMany({ where: { year: TEST_YEAR } });
    await prisma.academicYear.update({
      where: { year: 2026 },
      data: { isCurrent: true },
    });
  });

  it("감사 FK 실패가 같은 트랜잭션의 대표 변경까지 롤백한다", async () => {
    await expect(
      withTransaction(async (tx) => {
        await tx.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
        await tx.academicYear.update({
          where: { year: TEST_YEAR },
          data: { isCurrent: true },
        });

        await recordAudit(
          {
            actorUserId: randomUUID(),
            action: "academic-year:set-current",
            targetType: "AcademicYear",
            targetId: String(TEST_YEAR),
          },
          tx,
        );
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    const oldCurrent = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    const attemptedCurrent = await prisma.academicYear.findUnique({
      where: { year: TEST_YEAR },
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "academic-year:set-current",
        targetType: "AcademicYear",
        targetId: String(TEST_YEAR),
      },
    });

    expect(oldCurrent?.isCurrent).toBe(true);
    expect(attemptedCurrent?.isCurrent).toBe(false);
    expect(audit).toBeNull();
  });
});
