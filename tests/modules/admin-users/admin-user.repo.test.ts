import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const studentProfileUpdate = vi.fn();
const schoolClassUpsert = vi.fn();
const enrollmentUpsert = vi.fn();

const tx = {
  studentProfile: { update: studentProfileUpdate },
  schoolClass: { upsert: schoolClassUpsert },
  enrollment: { upsert: enrollmentUpsert },
};

vi.mock("@/core/db/client", () => ({
  prisma: {
    user: { update },
    // updateEnrollment는 트랜잭션 안에서 돈다 — 콜백에 tx를 그대로 넘겨 흉내 낸다.
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  },
}));

const { EmailTakenError, NumberTakenError, updateEnrollment, updateProfile } =
  await import("@/modules/admin-users/admin-user.repo");

/**
 * P2002의 생김새는 Prisma 버전과 접속 방식에 묶여 있다.
 * 아래는 Prisma 7.9 + @prisma/adapter-pg에서 **실제로 관측한** 오류다.
 * (드라이버 어댑터를 쓰면 위반 컬럼이 meta.target에 오지 않는다 — 처음에 여기서 틀렸다.)
 * 업그레이드로 모양이 바뀌면 이 테스트가 먼저 깨져야 한다.
 */
function realWorldP2002() {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "User",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage:
            'duplicate key value violates unique constraint "user_email_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["email"] },
        },
      },
    },
  });
}

/** updateEnrollment 쪽 실물 P2002 — 위반 컬럼만 (classId, number) 복합 유일키로 바뀐다. */
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

const data = {
  name: "김학생",
  email: "taken@gbsw.hs.kr",
  phone: "010-1111-2222",
};

const enrollmentData = { birthDate: new Date("2010-07-27T15:00:00.000Z"), grade: 1, classNo: 2, number: 15 };

// 블록 본문으로 둔다. `() => update.mockReset()`은 목 함수를 반환하는데,
// vitest는 훅이 돌려준 함수를 teardown으로 보고 매 테스트 뒤에 호출한다.
// 그러면 목이 한 번 더 실행돼 아무도 받지 않는 rejected promise가 생긴다.
beforeEach(() => {
  update.mockReset();
  studentProfileUpdate.mockReset().mockResolvedValue(undefined);
  schoolClassUpsert.mockReset().mockResolvedValue({ id: "class-1" });
  enrollmentUpsert.mockReset().mockResolvedValue(undefined);
});

describe("updateProfile()", () => {
  it("이메일 중복이면 EmailTakenError로 옮긴다", async () => {
    update.mockRejectedValue(realWorldP2002());

    await expect(updateProfile("u-9", data)).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it("어댑터가 인덱스 이름만 줘도 알아본다", async () => {
    const error = realWorldP2002();
    error.meta.driverAdapterError.cause.constraint = {
      index: "user_email_key",
    } as never;
    update.mockRejectedValue(error);

    await expect(updateProfile("u-9", data)).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it("옛 meta.target 표현도 받아 둔다", async () => {
    update.mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: "P2002",
        meta: { target: ["email"] },
      }),
    );

    await expect(updateProfile("u-9", data)).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it("이메일이 아닌 제약 위반은 그대로 올려보낸다", async () => {
    const other = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { target: ["phone"] },
    });
    update.mockRejectedValue(other);

    await expect(updateProfile("u-9", data)).rejects.toBe(other);
  });

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    update.mockRejectedValue(boom);

    await expect(updateProfile("u-9", data)).rejects.toBe(boom);
  });
});

describe("updateEnrollment()", () => {
  it("반·번호 중복이면 NumberTakenError로 옮긴다", async () => {
    enrollmentUpsert.mockRejectedValue(realWorldNumberP2002());

    await expect(
      updateEnrollment("sp-1", 2026, enrollmentData),
    ).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("어댑터가 인덱스 이름만 줘도 알아본다", async () => {
    const error = realWorldNumberP2002();
    error.meta.driverAdapterError.cause.constraint = {
      index: "Enrollment_classId_number_key",
    } as never;
    enrollmentUpsert.mockRejectedValue(error);

    await expect(
      updateEnrollment("sp-1", 2026, enrollmentData),
    ).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("(classId, number)와 무관한 유일 제약 위반은 그대로 올려보낸다", async () => {
    const other = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { target: ["studentProfileId", "year"] },
    });
    enrollmentUpsert.mockRejectedValue(other);

    await expect(updateEnrollment("sp-1", 2026, enrollmentData)).rejects.toBe(
      other,
    );
  });

  it("성공하면 학급을 찾아 소속을 갱신한다", async () => {
    await updateEnrollment("sp-1", 2026, enrollmentData);

    expect(studentProfileUpdate).toHaveBeenCalledWith({
      where: { id: "sp-1" },
      data: { birthDate: enrollmentData.birthDate },
    });
    expect(enrollmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId_year: { studentProfileId: "sp-1", year: 2026 } },
      }),
    );
  });
});
