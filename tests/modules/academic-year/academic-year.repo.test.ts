import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const findFirst = vi.fn();
const queryRaw = vi.fn();
const withTransaction = vi.fn();
const tx = {
  academicYear: { create, updateMany, update, findFirst },
  $queryRaw: queryRaw,
};

vi.mock("@/core/db/client", () => ({
  withTransaction,
  prisma: {
    academicYear: { create, updateMany, update, findFirst },
    $queryRaw: queryRaw,
  },
}));

const { YearTakenError, createYear, setCurrent } = await import(
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
  updateMany.mockReset();
  update.mockReset();
  findFirst.mockReset().mockResolvedValue({ year: 2026 });
  queryRaw.mockReset().mockResolvedValue([{ year: 2026 }, { year: 2027 }]);
  withTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
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

  it("db가 전달되면 그 db로 만들고 자체 트랜잭션을 열지 않는다", async () => {
    await createYear(2026, tx as never);

    expect(withTransaction).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ data: { year: 2026 } });
  });
});

describe("setCurrent()", () => {
  it("standalone 호출은 기존 현재 학년도 해제와 신규 지정을 한 트랜잭션으로 묶는다", async () => {
    await expect(setCurrent(2027)).resolves.toEqual({
      changed: true,
      previousYear: 2026,
    });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { year: 2027 },
      data: { isCurrent: true },
    });
  });

  it("db가 전달되면 자체 트랜잭션을 열지 않는다", async () => {
    await expect(setCurrent(2027, tx as never)).resolves.toEqual({
      changed: true,
      previousYear: 2026,
    });

    expect(withTransaction).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { year: 2027 },
      data: { isCurrent: true },
    });
  });

  it("잠근 뒤 이미 현재 학년도면 쓰지 않는다", async () => {
    findFirst.mockResolvedValue({ year: 2027 });

    await expect(setCurrent(2027, tx as never)).resolves.toEqual({
      changed: false,
      previousYear: 2027,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
