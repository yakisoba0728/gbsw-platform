import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const userUpdate = vi.fn();
const userFindMany = vi.fn();
const studentProfileUpdate = vi.fn();
const schoolClassUpsert = vi.fn();
const enrollmentUpsert = vi.fn();
const sessionDeleteMany = vi.fn();
const accountUpdateMany = vi.fn();
const transactionArray = vi.fn();

const tx = {
  user: { update: userUpdate },
  studentProfile: { update: studentProfileUpdate },
  schoolClass: { upsert: schoolClassUpsert },
  enrollment: { upsert: enrollmentUpsert },
  session: { deleteMany: sessionDeleteMany },
  account: { updateMany: accountUpdateMany },
};

vi.mock("@/core/db/client", () => ({
  prisma: {
    user: { update: userUpdate, findMany: userFindMany },
    session: { deleteMany: sessionDeleteMany },
    // updateUserAndEnrollment/resetCredential은 콜백형 트랜잭션 — 콜백에 tx를 넘겨 흉내 낸다.
    // setActive(비활성화)는 배열형 트랜잭션 — 배열을 그대로 기록해 둔다.
    $transaction: (arg: unknown) => {
      if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(tx);
      transactionArray(arg);
      return Promise.resolve(arg);
    },
  },
}));

const {
  EmailTakenError,
  NumberTakenError,
  listUsers,
  updateUserAndEnrollment,
  setActive,
  resetCredential,
} = await import("@/modules/admin-users/admin-user.repo");

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

/** enrollment 쪽 실물 P2002 — 위반 컬럼만 (classId, number) 복합 유일키로 바뀐다. */
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

const profileData = {
  name: "김학생",
  email: "taken@gbsw.hs.kr",
  phone: "010-1111-2222",
};

const studentProfileData = {
  studentProfileId: "sp-1",
  birthDate: new Date("2010-07-27T15:00:00.000Z"),
};

const enrollmentData = {
  studentProfileId: "sp-1",
  year: 2026,
  grade: 1,
  classNo: 2,
  number: 15,
};

beforeEach(() => {
  userUpdate.mockReset().mockResolvedValue(undefined);
  userFindMany.mockReset().mockResolvedValue([]);
  studentProfileUpdate.mockReset().mockResolvedValue(undefined);
  schoolClassUpsert.mockReset().mockResolvedValue({ id: "class-1" });
  enrollmentUpsert.mockReset().mockResolvedValue(undefined);
  sessionDeleteMany.mockReset().mockResolvedValue(undefined);
  accountUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  transactionArray.mockReset();
});

describe("listUsers()", () => {
  it("명단에서 빠져 소프트 삭제된 계정은 뺀다 — 상세(findDetail)는 여전히 조회할 수 있다", async () => {
    await listUsers(2026);

    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

describe("updateUserAndEnrollment() — profile", () => {
  it("이메일 중복이면 EmailTakenError로 옮긴다", async () => {
    userUpdate.mockRejectedValue(realWorldP2002());

    await expect(
      updateUserAndEnrollment("u-9", {
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("어댑터가 인덱스 이름만 줘도 알아본다", async () => {
    const error = realWorldP2002();
    error.meta.driverAdapterError.cause.constraint = {
      index: "user_email_key",
    } as never;
    userUpdate.mockRejectedValue(error);

    await expect(
      updateUserAndEnrollment("u-9", {
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("이메일이 아닌 제약 위반은 그대로 올려보낸다", async () => {
    const other = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { target: ["phone"] },
    });
    userUpdate.mockRejectedValue(other);

    await expect(
      updateUserAndEnrollment("u-9", {
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      }),
    ).rejects.toBe(other);
  });

  it("profile이 null이면 user.update를 부르지 않는다", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: null,
      studentProfile: null,
      enrollment: null,
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("updateUserAndEnrollment() — studentProfile(생년월일)", () => {
  it("학년·반·번호를 건드리지 않고 생년월일만 고칠 수 있다 (I2) — 졸업생 편집 경로", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: null,
      studentProfile: studentProfileData,
      enrollment: null,
    });

    expect(studentProfileUpdate).toHaveBeenCalledWith({
      where: { id: "sp-1" },
      data: { birthDate: studentProfileData.birthDate },
    });
    expect(schoolClassUpsert).not.toHaveBeenCalled();
    expect(enrollmentUpsert).not.toHaveBeenCalled();
  });

  it("studentProfile이 null이면 studentProfile.update를 부르지 않는다", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    });
    expect(studentProfileUpdate).not.toHaveBeenCalled();
  });
});

describe("updateUserAndEnrollment() — enrollment(학년·반·번호)", () => {
  it("반·번호 중복이면 NumberTakenError로 옮긴다", async () => {
    enrollmentUpsert.mockRejectedValue(realWorldNumberP2002());

    await expect(
      updateUserAndEnrollment("u-9", {
        profile: null,
        studentProfile: null,
        enrollment: enrollmentData,
      }),
    ).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("성공하면 학급을 찾아 소속을 갱신한다", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    });

    expect(enrollmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId_year: { studentProfileId: "sp-1", year: 2026 } },
      }),
    );
  });

  it("update에는 status를 넣지 않는다 (I2) — 기존 학적을 덮어쓰지 않는다", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    });

    const call = enrollmentUpsert.mock.calls[0]![0];
    expect(call.update).not.toHaveProperty("status");
    // create는 배정이 아예 없던 학생을 위한 것이라 ENROLLED로 시작한다.
    expect(call.create.status).toBe("ENROLLED");
  });

  it("enrollment가 null이면 소속 관련 문장을 하나도 안 부른다", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: profileData,
      studentProfile: null,
      enrollment: null,
    });

    expect(schoolClassUpsert).not.toHaveBeenCalled();
    expect(enrollmentUpsert).not.toHaveBeenCalled();
  });

  it("profile·studentProfile·enrollment를 한 트랜잭션에서 함께 저장한다 (I1)", async () => {
    await updateUserAndEnrollment("u-9", {
      profile: profileData,
      studentProfile: studentProfileData,
      enrollment: enrollmentData,
    });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u-9" }, data: profileData });
    expect(studentProfileUpdate).toHaveBeenCalled();
    expect(enrollmentUpsert).toHaveBeenCalled();
  });
});

describe("setActive()", () => {
  it("활성화는 상태만 바꾸고 세션은 건드리지 않는다", async () => {
    await setActive("u-9", true);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-9" },
      data: { status: "ACTIVE" },
    });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
    expect(transactionArray).not.toHaveBeenCalled();
  });

  it("비활성화는 상태 변경과 세션 삭제를 한 트랜잭션(배열)으로 묶는다 (M11)", async () => {
    await setActive("u-9", false);

    expect(transactionArray).toHaveBeenCalledTimes(1);
    const batch = transactionArray.mock.calls[0]![0] as unknown[];
    expect(batch).toHaveLength(2);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-9" },
      data: { status: "INACTIVE" },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
  });
});

describe("resetCredential()", () => {
  it("비밀번호가 없는 계정이면 아무것도 바꾸지 않고 0을 돌려준다", async () => {
    accountUpdateMany.mockResolvedValue({ count: 0 });

    const updated = await resetCredential("u-9", "hash");

    expect(updated).toBe(0);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("성공하면 강제 변경 표시와 세션 삭제까지 같은 트랜잭션에서 한다 (M11)", async () => {
    const updated = await resetCredential("u-9", "hash");

    expect(updated).toBe(1);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-9" },
      data: { mustChangePassword: true },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
  });
});
