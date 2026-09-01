import { beforeEach, describe, expect, it, vi } from "vitest";
import { isStudentCode } from "@/lib/student-code";
import { coreMocks } from "../../helpers/core-mocks";

const userCreate = vi.fn();
const accountCreate = vi.fn();
const schoolClassUpsert = vi.fn();
const studentProfileCreate = vi.fn();
const enrollmentCreate = vi.fn();
const inviteUpdate = vi.fn();
const inviteUpdateMany = vi.fn();
const academicYearFindFirst = vi.fn();
const queryRaw = vi.fn();
const { bareWithTransaction: withTransaction } = coreMocks(
  "registration-repo-test",
);

/**
 * `withTransaction(callback)`을 그대로 흉내 낸다 — 콜백에 tx를 넘겨 실행할 뿐,
 * 실제 트랜잭션·롤백은 흉내 내지 않는다. 여기서 확인하려는 건 P2002를 잡아
 * NumberTakenError로 옮기는 로직이지, 트랜잭션 자체의 원자성이 아니다.
 */
const txClient = {
  user: { create: userCreate },
  account: { create: accountCreate },
  schoolClass: { upsert: schoolClassUpsert },
  studentProfile: { create: studentProfileCreate },
  enrollment: { create: enrollmentCreate },
  invite: { update: inviteUpdate, updateMany: inviteUpdateMany },
  academicYear: { findFirst: academicYearFindFirst },
  $queryRaw: queryRaw,
};

vi.mock("@/core/db/client", () => ({
  prisma: txClient,
  withTransaction,
}));

const {
  completeStudentRegistration,
  findCurrentYearForUpdate,
  NumberTakenError,
  registerFailedAttempt,
} = await import("@/modules/registration/registration.repo");

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

/** 위와 같은 모양이지만 위반 컬럼이 StudentProfile.studentCode다. */
function realWorldStudentCodeP2002() {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "StudentProfile",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage:
            'duplicate key value violates unique constraint "StudentProfile_studentCode_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["studentCode"] },
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
  inviteUpdate.mockReset().mockResolvedValue({ failedAttempts: 1 });
  inviteUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  academicYearFindFirst.mockReset().mockResolvedValue({ year: 2026 });
  queryRaw.mockReset().mockResolvedValue([{ year: 2026 }]);
  withTransaction
    .mockReset()
    .mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
      fn(txClient),
    );
});

describe("registerFailedAttempt()", () => {
  it("실패 횟수가 한계 미만이면 코드를 폐기하지 않는다", async () => {
    inviteUpdate.mockResolvedValue({ failedAttempts: 1 });

    await expect(registerFailedAttempt("inv-1", 5)).resolves.toEqual({
      revoked: false,
    });

    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("실패 횟수가 한계에 닿으면 PENDING 코드만 폐기한다", async () => {
    inviteUpdate.mockResolvedValue({ failedAttempts: 5 });
    inviteUpdateMany.mockResolvedValue({ count: 1 });

    await expect(registerFailedAttempt("inv-1", 5)).resolves.toEqual({
      revoked: true,
    });

    expect(inviteUpdateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: "PENDING" },
      data: { status: "REVOKED" },
    });
  });

  it("동시에 이미 폐기된 경우에는 감사로그 대상이 아니라고 돌려준다", async () => {
    inviteUpdate.mockResolvedValue({ failedAttempts: 5 });
    inviteUpdateMany.mockResolvedValue({ count: 0 });

    await expect(registerFailedAttempt("inv-1", 5)).resolves.toEqual({
      revoked: false,
    });
  });
});

describe("findCurrentYearForUpdate()", () => {
  it("학년도 전환과 같은 순서로 잠근 뒤 현재 학년도를 읽는다", async () => {
    await expect(findCurrentYearForUpdate(txClient as never)).resolves.toBe(2026);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(academicYearFindFirst).toHaveBeenCalledWith({
      where: { isCurrent: true },
      select: { year: true },
    });
  });

  it("현재 학년도가 없으면 null이다", async () => {
    academicYearFindFirst.mockResolvedValue(null);

    await expect(findCurrentYearForUpdate(txClient as never)).resolves.toBeNull();
  });
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
      data: { status: "USED", usedById: "u-1" },
    });

    // 학생코드는 여기서 직접 부여한다 — student-code.ts의 형식(8자리, 문자로 시작)을 따른다.
    const call = studentProfileCreate.mock.calls[0]![0] as {
      data: { studentCode: string };
    };
    expect(isStudentCode(call.data.studentCode)).toBe(true);
  });

  it("학생코드가 겹치면 트랜잭션째 재시도해 새 코드로 다시 만든다", async () => {
    studentProfileCreate
      .mockRejectedValueOnce(realWorldStudentCodeP2002())
      .mockResolvedValue({ id: "profile-1" });

    await completeStudentRegistration("inv-1", account, student, 2026);

    // 롤백된 시도도 트랜잭션 전체를 다시 돈다 — 계정 생성부터 두 번째로 돈다.
    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(studentProfileCreate).toHaveBeenCalledTimes(2);
    expect(userCreate).toHaveBeenCalledTimes(2);
    // 최종적으로는 성공한 시도에서만 코드가 한 번 소진된다.
    expect(inviteUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("재시도를 다 써도 계속 겹치면 실패를 그대로 올려보낸다", async () => {
    const error = realWorldStudentCodeP2002();
    studentProfileCreate.mockRejectedValue(error);

    await expect(
      completeStudentRegistration("inv-1", account, student, 2026),
    ).rejects.toBe(error);

    expect(studentProfileCreate).toHaveBeenCalledTimes(5);
    expect(withTransaction).toHaveBeenCalledTimes(5);
    // 코드가 끝내 없었으니 어떤 시도도 초대코드를 소진하지 못한다.
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });
});
