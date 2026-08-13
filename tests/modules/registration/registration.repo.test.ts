import { beforeEach, describe, expect, it, vi } from "vitest";

const userCreate = vi.fn();
const accountCreate = vi.fn();
const schoolClassUpsert = vi.fn();
const studentProfileCreate = vi.fn();
const enrollmentCreate = vi.fn();
const inviteUpdateMany = vi.fn();

/**
 * `prisma.$transaction(callback)`을 그대로 흉내 낸다 — 콜백에 tx를 넘겨 실행할 뿐,
 * 실제 트랜잭션·롤백은 흉내 내지 않는다. 여기서 확인하려는 건 P2002를 잡아
 * NumberTakenError로 옮기는 로직이지, 트랜잭션 자체의 원자성이 아니다.
 */
const tx = {
  user: { create: userCreate },
  account: { create: accountCreate },
  schoolClass: { upsert: schoolClassUpsert },
  studentProfile: { create: studentProfileCreate },
  enrollment: { create: enrollmentCreate },
  invite: { updateMany: inviteUpdateMany },
};

vi.mock("@/core/db/client", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) },
}));

const { completeStudentRegistration, NumberTakenError } = await import(
  "@/modules/registration/registration.repo"
);

/**
 * `tests/modules/admin-users/admin-user.repo.test.ts`가 관측해 둔 실물 P2002 모양을
 * 그대로 가져온다. 다만 위반 컬럼은 email이 아니라 (classId, number) 복합 유일키다.
 */
function realWorldP2002() {
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

const account = {
  userId: "u-1",
  accountId: "a-1",
  name: "김학생",
  email: "new@gbsw.hs.kr",
  phone: "010-1234-5678",
  passwordHash: "hashed",
};

const student = {
  birthDate: new Date("2010-03-03T15:00:00.000Z"),
  grade: 1,
  classNo: 2,
  number: 15,
};

beforeEach(() => {
  userCreate.mockReset().mockResolvedValue(undefined);
  accountCreate.mockReset().mockResolvedValue(undefined);
  schoolClassUpsert.mockReset().mockResolvedValue({ id: "class-1" });
  studentProfileCreate.mockReset().mockResolvedValue({ id: "profile-1" });
  enrollmentCreate.mockReset().mockResolvedValue(undefined);
  inviteUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("completeStudentRegistration()", () => {
  it("반·번호가 이미 쓰였으면 NumberTakenError로 옮긴다", async () => {
    enrollmentCreate.mockRejectedValue(realWorldP2002());

    await expect(
      completeStudentRegistration("inv-1", account, student, 2026),
    ).rejects.toBeInstanceOf(NumberTakenError);

    // 코드가 낭비되면 안 된다 — 소진 시도까지 가지 않는다.
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("어댑터가 인덱스 이름만 줘도 알아본다", async () => {
    const error = realWorldP2002();
    (
      error.meta.driverAdapterError.cause as { constraint: unknown }
    ).constraint = { index: "Enrollment_classId_number_key" };
    enrollmentCreate.mockRejectedValue(error);

    await expect(
      completeStudentRegistration("inv-1", account, student, 2026),
    ).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("(classId, number)와 무관한 유일 제약 위반은 그대로 올려보낸다", async () => {
    const other = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { target: ["studentProfileId", "year"] },
    });
    enrollmentCreate.mockRejectedValue(other);

    await expect(
      completeStudentRegistration("inv-1", account, student, 2026),
    ).rejects.toBe(other);
  });

  it("성공하면 순서대로 계정·학급·소속을 만들고 코드를 소진한다", async () => {
    await completeStudentRegistration("inv-1", account, student, 2026);

    expect(userCreate).toHaveBeenCalled();
    expect(enrollmentCreate).toHaveBeenCalledWith({
      data: {
        studentProfileId: "profile-1",
        year: 2026,
        classId: "class-1",
        number: 15,
        status: "ENROLLED",
      },
    });
    expect(inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: "PENDING" },
      data: expect.objectContaining({ status: "USED" }),
    });
  });
});
