import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: { academicYear: { create } },
}));

const { YearTakenError, createYear } = await import(
  "@/modules/academic-year/academic-year.repo"
);

/**
 * year는 @id라 유일 제약 위반이 PK 위반(`AcademicYear_pkey`)으로 온다.
 * 아래는 Prisma 7.9 + @prisma/adapter-pg에서 **실제로 관측한** 오류다
 * (admin-user.repo.test.ts와 같은 방식 — 위반 컬럼은 constraint.fields에 온다).
 */
function realWorldP2002() {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "AcademicYear",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage:
            'duplicate key value violates unique constraint "AcademicYear_pkey"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["year"] },
        },
      },
    },
  });
}

beforeEach(() => {
  create.mockReset();
});

describe("createYear()", () => {
  it("이미 있는 학년도면 YearTakenError로 옮긴다", async () => {
    create.mockRejectedValue(realWorldP2002());

    await expect(createYear(2026)).rejects.toBeInstanceOf(YearTakenError);
  });

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    create.mockRejectedValue(boom);

    await expect(createYear(2026)).rejects.toBe(boom);
  });
});
