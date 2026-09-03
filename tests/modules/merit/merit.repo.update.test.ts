import { beforeEach, describe, expect, it, vi } from "vitest";

const ruleUpdateMany = vi.fn();
const thresholdCreate = vi.fn();
const thresholdUpdateMany = vi.fn();
const academicYearFindFirst = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/core/db/client", () => ({
  prisma: {
    meritRule: { updateMany: ruleUpdateMany },
    meritThreshold: { create: thresholdCreate, updateMany: thresholdUpdateMany },
    academicYear: { findFirst: academicYearFindFirst },
    $queryRaw: queryRaw,
  },
  withTransaction: vi.fn(),
}));

const {
  createThreshold,
  findCurrentYearForUpdate,
  findRuleForUpdate,
  markRuleDeleted,
  updateRule,
  updateThreshold,
} = await import("@/modules/merit/merit.repo");

const expectedUpdatedAt = new Date("2026-08-19T00:00:00.000Z");
const data = {
  label: "수정",
  points: 3,
  category: null,
  description: null,
};

beforeEach(() => {
  ruleUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  thresholdCreate.mockReset().mockResolvedValue({});
  thresholdUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  academicYearFindFirst.mockReset().mockResolvedValue({ year: 2026 });
  queryRaw.mockReset().mockResolvedValue([{ id: "r-1", active: true }]);
});

function p2002(fields: string[]) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target: fields },
  });
}

describe("updateRule()", () => {
  it("화면이 읽은 updatedAt과 같은 행만 갱신한다", async () => {
    await expect(updateRule("r-1", data, expectedUpdatedAt)).resolves.toBe(true);

    expect(ruleUpdateMany).toHaveBeenCalledWith({
      where: { id: "r-1", updatedAt: expectedUpdatedAt },
      data,
    });
  });

  it("그 사이 행이 바뀌어 갱신 수가 0이면 false다", async () => {
    ruleUpdateMany.mockResolvedValue({ count: 0 });

    await expect(updateRule("r-1", data, expectedUpdatedAt)).resolves.toBe(false);
  });
});

describe("markRuleDeleted()", () => {
  it("active인 규정만 비활성화하고 갱신 수를 돌려준다", async () => {
    await expect(markRuleDeleted("r-1", expectedUpdatedAt)).resolves.toBe(1);

    expect(ruleUpdateMany).toHaveBeenCalledWith({
      where: { id: "r-1", active: true, updatedAt: expectedUpdatedAt },
      data: { active: false },
    });
  });

  it("이미 비활성화된 규정이면 0이다", async () => {
    ruleUpdateMany.mockResolvedValue({ count: 0 });

    await expect(markRuleDeleted("r-1", expectedUpdatedAt)).resolves.toBe(0);
  });
});

describe("findRuleForUpdate()", () => {
  it("규정 행을 잠근 결과의 첫 행을 돌려준다", async () => {
    await expect(findRuleForUpdate("r-1", { $queryRaw: queryRaw } as never)).resolves.toEqual({
      id: "r-1",
      active: true,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("규정이 없으면 null이다", async () => {
    queryRaw.mockResolvedValue([]);

    await expect(findRuleForUpdate("missing", { $queryRaw: queryRaw } as never)).resolves.toBeNull();
  });
});

describe("findCurrentYearForUpdate()", () => {
  it("학년도 전환과 같은 순서로 잠근 뒤 현재 학년도를 읽는다", async () => {
    const tx = {
      $queryRaw: queryRaw,
      academicYear: { findFirst: academicYearFindFirst },
    };

    await expect(findCurrentYearForUpdate(tx as never)).resolves.toBe(2026);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(academicYearFindFirst).toHaveBeenCalledWith({
      where: { isCurrent: true },
      select: { year: true },
    });
  });

  it("현재 학년도가 없으면 null이다", async () => {
    const tx = {
      $queryRaw: queryRaw,
      academicYear: { findFirst: academicYearFindFirst },
    };
    academicYearFindFirst.mockResolvedValue(null);

    await expect(findCurrentYearForUpdate(tx as never)).resolves.toBeNull();
  });
});

describe("threshold writes", () => {
  const threshold = {
    track: "SCHOOL" as const,
    warn: 20,
    danger: 30,
    updatedByUserId: "admin-1",
    updatedByName: "관리자",
  };

  it("미설정 행은 create로만 만든다", async () => {
    await expect(createThreshold(threshold)).resolves.toBe(true);

    expect(thresholdCreate).toHaveBeenCalledWith({ data: threshold });
  });

  it("미설정 행 생성 중 다른 요청이 먼저 만들면 false다", async () => {
    thresholdCreate.mockRejectedValue(p2002(["track"]));

    await expect(createThreshold(threshold)).resolves.toBe(false);
  });

  it("미설정 행 생성 경합이 primary key 모양(필드·인덱스)으로 와도 false다", async () => {
    thresholdCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { fields: ["track"], index: "MeritThreshold_pkey" },
            },
          },
        },
      }),
    );

    await expect(createThreshold(threshold)).resolves.toBe(false);
  });

  it("트랙이 아닌 유일 제약 위반이면 삼키지 않고 올린다", async () => {
    thresholdCreate.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { fields: ["other"], index: "MeritThreshold_other_key" },
            },
          },
        },
      }),
    );

    await expect(createThreshold(threshold)).rejects.toThrow(
      "Unique constraint failed",
    );
  });

  it("설정된 행은 화면이 읽은 updatedAt과 같은 경우만 갱신한다", async () => {
    await expect(updateThreshold(threshold, expectedUpdatedAt)).resolves.toBe(true);

    expect(thresholdUpdateMany).toHaveBeenCalledWith({
      where: { track: "SCHOOL", updatedAt: expectedUpdatedAt },
      data: {
        warn: 20,
        danger: 30,
        updatedByUserId: "admin-1",
        updatedByName: "관리자",
      },
    });
  });

  it("설정된 행 갱신 수가 0이면 false다", async () => {
    thresholdUpdateMany.mockResolvedValue({ count: 0 });

    await expect(updateThreshold(threshold, expectedUpdatedAt)).resolves.toBe(false);
  });
});
