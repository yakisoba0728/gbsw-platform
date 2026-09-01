import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const schoolClassUpsert = vi.fn();
const enrollmentUpsert = vi.fn();
const userUpdate = vi.fn();
const sessionDeleteMany = vi.fn();
const studentProfileFindMany = vi.fn();
const { bareWithTransaction: withTransaction } = coreMocks(
  "enrollment-repo-test",
);

const tx = {
  schoolClass: { upsert: schoolClassUpsert },
  enrollment: { upsert: enrollmentUpsert },
  user: { update: userUpdate },
  session: { deleteMany: sessionDeleteMany },
};

vi.mock("@/core/db/client", () => ({
  prisma: {
    studentProfile: { findMany: studentProfileFindMany },
  },
  // applyAll은 단일 트랜잭션 안에서 돈다 — 콜백에 tx를 그대로 넘겨 흉내 낸다.
  withTransaction,
}));

const { NumberTakenError, applyAll, listByYear } = await import(
  "@/modules/enrollment/enrollment.repo"
);

/**
 * (classId, number)의 실물 P2002 — admin-user.repo.test.ts에서 관측한 것과 같은 모양.
 * Prisma 7.9 + @prisma/adapter-pg는 위반 컬럼을 meta.driverAdapterError에 담는다.
 */
function realWorldNumberP2002() {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "Enrollment",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage:
            'duplicate key value violates unique constraint "Enrollment_classId_number_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["classId", "number"] },
        },
      },
    },
  });
}

function planned(overrides: Partial<Parameters<typeof applyAll>[1][number]> = {}) {
  return {
    studentProfileId: "sp-1",
    userId: "u-1",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED" as const,
    accountActive: true,
    statusChanged: false,
    ...overrides,
  };
}

beforeEach(() => {
  schoolClassUpsert.mockReset().mockResolvedValue({ id: "class-1" });
  enrollmentUpsert.mockReset().mockResolvedValue(undefined);
  userUpdate.mockReset().mockResolvedValue(undefined);
  sessionDeleteMany.mockReset().mockResolvedValue(undefined);
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  withTransaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
});

describe("applyAll()", () => {
  it("단일 withTransaction 안에서 처리하고 timeout/maxWait을 고정한다 (C1)", async () => {
    await applyAll(2026, [planned()]);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(withTransaction.mock.calls[0]![1]).toEqual({ timeout: 30_000, maxWait: 5_000 });
  });

  it("tx가 전달되면 중첩 트랜잭션을 열지 않고 그 tx로 처리한다", async () => {
    await applyAll(
      2026,
      [planned()],
      tx as unknown as NonNullable<Parameters<typeof applyAll>[2]>,
    );

    expect(withTransaction).not.toHaveBeenCalled();
    expect(enrollmentUpsert).toHaveBeenCalledTimes(1);
  });

  it("statusChanged가 false면 상태는 유지하고 aggregate revision만 올린다 (I1)", async () => {
    await applyAll(2026, [planned({ statusChanged: false, accountActive: false })]);

    expect(enrollmentUpsert).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("statusChanged가 true면 계정 상태를 쓴다", async () => {
    await applyAll(2026, [planned({ statusChanged: true, accountActive: true })]);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { status: "ACTIVE" },
    });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("비활성으로 넘어가면 세션도 지운다", async () => {
    await applyAll(2026, [planned({ statusChanged: true, accountActive: false })]);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { status: "INACTIVE" },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });

  it("여러 명을 한 번에 넘기면 모두 같은 트랜잭션 안에서 처리한다", async () => {
    await applyAll(2026, [
      planned({ studentProfileId: "sp-1", userId: "u-1" }),
      planned({ studentProfileId: "sp-2", userId: "u-2", number: 4 }),
    ]);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(enrollmentUpsert).toHaveBeenCalledTimes(2);
  });

  it("반·번호 중복은 NumberTakenError로 옮긴다", async () => {
    enrollmentUpsert.mockRejectedValue(realWorldNumberP2002());

    await expect(applyAll(2026, [planned()])).rejects.toBeInstanceOf(
      NumberTakenError,
    );
  });

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    enrollmentUpsert.mockRejectedValue(boom);

    await expect(applyAll(2026, [planned()])).rejects.toBe(boom);
  });

  it("재학이 아닌 항목은 학급을 만들지 않는다", async () => {
    await applyAll(2026, [
      planned({ status: "GRADUATED", grade: null, classNo: null, number: null }),
    ]);

    expect(schoolClassUpsert).not.toHaveBeenCalled();
    expect(enrollmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ classId: null, number: null, status: "GRADUATED" }),
      }),
    );
  });
});

describe("listByYear()", () => {
  it("role이 STUDENT이고 명단에 남아 있는 학생만 조회한다", async () => {
    await listByYear(2026);

    expect(studentProfileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { role: "STUDENT", deletedAt: null } } }),
    );
  });
});
