import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const userUpdate = vi.fn();
const userUpdateMany = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userDelete = vi.fn();
const userDeleteMany = vi.fn();
const studentProfileUpdate = vi.fn();
const enrollmentUpsert = vi.fn();
const sessionDeleteMany = vi.fn();
const accountUpdateMany = vi.fn();
const inviteDeleteMany = vi.fn();
const { bareWithTransaction: withTransaction } = coreMocks(
  "admin-user-repo-test",
);
const queryRaw = vi.fn();

const tx = {
  $queryRaw: queryRaw,
  user: {
    update: userUpdate,
    updateMany: userUpdateMany,
    findUnique: userFindUnique,
    delete: userDelete,
    deleteMany: userDeleteMany,
  },
  studentProfile: { update: studentProfileUpdate },
  enrollment: { upsert: enrollmentUpsert },
  session: { deleteMany: sessionDeleteMany },
  account: { updateMany: accountUpdateMany },
  invite: { deleteMany: inviteDeleteMany },
};

vi.mock("@/core/db/client", () => ({
  withTransaction,
  prisma: {
    user: {
      update: userUpdate,
      updateMany: userUpdateMany,
      findUnique: userFindUnique,
      findMany: userFindMany,
      delete: userDelete,
      deleteMany: userDeleteMany,
    },
    session: { deleteMany: sessionDeleteMany },
    invite: { deleteMany: inviteDeleteMany },
  },
}));

const {
  EmailTakenError,
  NumberTakenError,
  UserRevisionConflictError,
  listUsers,
  updateUserAndEnrollment,
  setActive,
  resetCredential,
  deletePermanently,
} = await import("@/modules/admin-users/admin-user.repo");

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
            'duplicate key value violates unique constraint "Enrollment_year_grade_classNo_number_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["year", "grade", "classNo", "number"] },
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
const expectedUpdatedAt = new Date("2026-08-19T00:00:00.000Z");

function updateInput(overrides: Partial<Parameters<typeof updateUserAndEnrollment>[1]> = {}) {
  return {
    expectedUpdatedAt,
    profile: null,
    studentProfile: null,
    enrollment: null,
    ...overrides,
  };
}

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([{ id: "credential-account" }]);
  userUpdate.mockReset().mockResolvedValue(undefined);
  userUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  userFindUnique.mockReset().mockResolvedValue(null);
  userFindMany.mockReset().mockResolvedValue([]);
  userDelete.mockReset().mockResolvedValue(undefined);
  userDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  studentProfileUpdate.mockReset().mockResolvedValue(undefined);
  enrollmentUpsert.mockReset().mockResolvedValue(undefined);
  sessionDeleteMany.mockReset().mockResolvedValue(undefined);
  accountUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  inviteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  withTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
});

describe("listUsers()", () => {
  it("legacy 삭제 표시가 남은 계정은 목록에서 뺀다 — 상세(findDetail)는 여전히 조회할 수 있다", async () => {
    await listUsers(2026);

    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});

describe("updateUserAndEnrollment() — profile", () => {
  it("이메일 중복이면 EmailTakenError로 옮긴다", async () => {
    userUpdateMany.mockRejectedValue(realWorldP2002());

    await expect(
      updateUserAndEnrollment("u-9", updateInput({
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      })),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("어댑터가 인덱스 이름만 줘도 알아본다", async () => {
    const error = realWorldP2002();
    error.meta.driverAdapterError.cause.constraint = {
      index: "user_email_key",
    } as never;
    userUpdateMany.mockRejectedValue(error);

    await expect(
      updateUserAndEnrollment("u-9", updateInput({
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      })),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("이메일이 아닌 제약 위반은 그대로 올려보낸다", async () => {
    const other = Object.assign(new Error("dup"), {
      code: "P2002",
      meta: { target: ["phone"] },
    });
    userUpdateMany.mockRejectedValue(other);

    await expect(
      updateUserAndEnrollment("u-9", updateInput({
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      })),
    ).rejects.toBe(other);
  });

  it("profile이 null이어도 revision 확인을 위해 user.updateMany를 부른다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: null,
      studentProfile: null,
      enrollment: null,
    }));
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u-9", updatedAt: expectedUpdatedAt },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("db가 전달되면 자체 트랜잭션을 열지 않는다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: profileData,
      studentProfile: null,
      enrollment: null,
    }), tx as never);

    expect(withTransaction).not.toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u-9", updatedAt: expectedUpdatedAt },
      data: { ...profileData, updatedAt: expect.any(Date) },
    });
  });

  it("updatedAt이 달라졌으면 UserRevisionConflictError로 옮긴다", async () => {
    userUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateUserAndEnrollment("u-9", updateInput({
        profile: profileData,
        studentProfile: null,
        enrollment: null,
      })),
    ).rejects.toBeInstanceOf(UserRevisionConflictError);
    expect(studentProfileUpdate).not.toHaveBeenCalled();
    expect(enrollmentUpsert).not.toHaveBeenCalled();
  });
});

describe("updateUserAndEnrollment() — studentProfile(생년월일)", () => {
  it("학년·반·번호를 건드리지 않고 생년월일만 고칠 수 있다 (I2) — 졸업생 편집 경로", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: null,
      studentProfile: studentProfileData,
      enrollment: null,
    }));

    expect(studentProfileUpdate).toHaveBeenCalledWith({
      where: { id: "sp-1" },
      data: { birthDate: studentProfileData.birthDate },
    });
    expect(enrollmentUpsert).not.toHaveBeenCalled();
  });

  it("studentProfile이 null이면 studentProfile.update를 부르지 않는다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    }));
    expect(studentProfileUpdate).not.toHaveBeenCalled();
  });
});

describe("updateUserAndEnrollment() — enrollment(학년·반·번호)", () => {
  it("반·번호 중복이면 NumberTakenError로 옮긴다", async () => {
    enrollmentUpsert.mockRejectedValue(realWorldNumberP2002());

    await expect(
      updateUserAndEnrollment("u-9", {
        expectedUpdatedAt,
        profile: null,
        studentProfile: null,
        enrollment: enrollmentData,
      }),
    ).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("성공하면 학년·반·번호를 소속에 직접 저장한다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    }));

    expect(enrollmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentProfileId_year: { studentProfileId: "sp-1", year: 2026 } },
        create: expect.objectContaining({ grade: 1, classNo: 2, number: 15 }),
        update: expect.objectContaining({ grade: 1, classNo: 2, number: 15 }),
      }),
    );
  });

  it("update에는 status를 넣지 않는다 (I2) — 기존 학적을 덮어쓰지 않는다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: null,
      studentProfile: null,
      enrollment: enrollmentData,
    }));

    const call = enrollmentUpsert.mock.calls[0]![0];
    expect(call.update).not.toHaveProperty("status");
    expect(call.create.status).toBe("ENROLLED");
  });

  it("enrollment가 null이면 소속 관련 문장을 하나도 안 부른다", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: profileData,
      studentProfile: null,
      enrollment: null,
    }));

    expect(enrollmentUpsert).not.toHaveBeenCalled();
  });

  it("profile·studentProfile·enrollment를 한 트랜잭션에서 함께 저장한다 (I1)", async () => {
    await updateUserAndEnrollment("u-9", updateInput({
      profile: profileData,
      studentProfile: studentProfileData,
      enrollment: enrollmentData,
    }));

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u-9", updatedAt: expectedUpdatedAt },
      data: { ...profileData, updatedAt: expect.any(Date) },
    });
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
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("비활성화는 상태 변경과 세션 삭제를 한 트랜잭션으로 묶는다 (M11)", async () => {
    await setActive("u-9", false);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-9" },
      data: { status: "INACTIVE" },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
  });

  it("db가 전달된 비활성화는 세션 삭제까지 그 db를 쓰고 중첩 트랜잭션을 열지 않는다", async () => {
    await setActive("u-9", false, tx as never);

    expect(withTransaction).not.toHaveBeenCalled();
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
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("성공하면 강제 변경 표시와 세션 삭제까지 같은 트랜잭션에서 한다 (M11)", async () => {
    const updated = await resetCredential("u-9", "hash");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(updated).toBe(1);
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u-9" },
      data: { mustChangePassword: true },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
  });

  it("db가 전달되면 자체 트랜잭션을 열지 않는다", async () => {
    const updated = await resetCredential("u-9", "hash", tx as never);

    expect(updated).toBe(1);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
  });
});

describe("deletePermanently()", () => {
  it("발급한 코드는 스냅샷과 함께 남기고 계정만 삭제한다", async () => {
    await deletePermanently("u-9", "김학생");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(inviteDeleteMany).not.toHaveBeenCalledWith({
      where: { createdById: "u-9" },
    });
    expect(userDeleteMany).toHaveBeenCalledWith({ where: { id: "u-9", name: "김학생" } });
  });

  it("가입에 쓴 코드(usedById)도 지운다 — metadata에 이름·생년월일이 남는다", async () => {
    await deletePermanently("u-9", "김학생");

    expect(inviteDeleteMany).toHaveBeenCalledWith({ where: { usedById: "u-9" } });
  });

  it("studentId로 달린 코드는 Cascade가 지우므로 손대지 않는다", async () => {
    await deletePermanently("u-9", "김학생");

    const calls = inviteDeleteMany.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => "studentId" in (c as { where: object }).where)).toBe(false);
  });

  it("이름 조건이 맞지 않아 삭제되지 않으면 false를 돌려준다", async () => {
    userDeleteMany.mockResolvedValue({ count: 0 });

    const deleted = await deletePermanently("u-9", "김학생");

    expect(deleted).toBe(false);
  });

  it("db가 전달되면 자체 트랜잭션을 열지 않는다", async () => {
    await deletePermanently("u-9", "김학생", tx as never);

    expect(withTransaction).not.toHaveBeenCalled();
    expect(inviteDeleteMany).not.toHaveBeenCalledWith({
      where: { createdById: "u-9" },
    });
    expect(inviteDeleteMany).toHaveBeenCalledWith({ where: { usedById: "u-9" } });
    expect(userDeleteMany).toHaveBeenCalledWith({ where: { id: "u-9", name: "김학생" } });
  });
});
