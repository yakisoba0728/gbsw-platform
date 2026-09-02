import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const enrollmentDeleteMany = vi.fn();
const enrollmentCreateMany = vi.fn();
const studentProfileFindMany = vi.fn();
const userUpdateMany = vi.fn();
const userDeleteMany = vi.fn();
const sessionDeleteMany = vi.fn();
const inviteCreate = vi.fn();
const inviteUpdateMany = vi.fn();
const inviteDeleteMany = vi.fn();
const inviteFindMany = vi.fn();
const { bareWithTransaction: withTransaction } = coreMocks(
  "enrollment-roster-repo-test",
);

const tx = {
  enrollment: { deleteMany: enrollmentDeleteMany, createMany: enrollmentCreateMany },
  studentProfile: { findMany: studentProfileFindMany },
  user: { updateMany: userUpdateMany, deleteMany: userDeleteMany },
  session: { deleteMany: sessionDeleteMany },
  invite: {
    create: inviteCreate,
    updateMany: inviteUpdateMany,
    deleteMany: inviteDeleteMany,
    findMany: inviteFindMany,
  },
};

vi.mock("@/core/db/client", () => ({
  prisma: {},
  withTransaction,
}));

const { InviteCodeCollisionError, NumberTakenError, applyRoster } = await import(
  "@/modules/enrollment/roster.repo"
);

function realWorldCodeP2002() {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      modelName: "Invite",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: 'duplicate key value violates unique constraint "Invite_code_key"',
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["code"] },
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
          constraint: { index: "Enrollment_year_grade_classNo_number_key" },
        },
      },
    },
  });
}

type ApplyInput = Parameters<typeof applyRoster>[1];
type RosterAssignment = ApplyInput["assignments"][number];

function assignment(overrides: Partial<RosterAssignment> = {}): RosterAssignment {
  return {
    line: 0,
    studentCode: "AAAA2345",
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    errors: [],
    studentProfileId: "sp-1",
    beforeName: "김동혁",
    statusChanged: false,
    ...overrides,
  };
}

function input(overrides: Partial<ApplyInput> = {}): ApplyInput {
  return {
    assignments: [assignment()],
    newStudents: [],
    inviteExpiresAt: null,
    managedStudentProfileIds: ["sp-1"],
    deleteStudentProfileIds: [],
    createdById: "admin-1",
    createdByName: "관리자",
    ...overrides,
  };
}

beforeEach(() => {
  enrollmentDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  enrollmentCreateMany.mockReset().mockResolvedValue({ count: 0 });
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  userUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  userDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  sessionDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  inviteCreate.mockReset().mockResolvedValue({ id: "inv-new" });
  inviteUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  inviteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  inviteFindMany.mockReset().mockResolvedValue([]);
  withTransaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
});

describe("applyRoster() — 명단에서 빠진 학생 기록 보존", () => {
  it("deleteStudentProfileIds가 비어 있으면 삭제 쿼리를 부르지 않는다", async () => {
    await applyRoster(2026, input({ deleteStudentProfileIds: [] }));

    expect(inviteUpdateMany).not.toHaveBeenCalled();
    expect(inviteDeleteMany).not.toHaveBeenCalled();
    expect(userDeleteMany).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("계정과 연결 기록을 지우지 않고 비활성·제외 표시 후 세션만 끊는다", async () => {
    studentProfileFindMany.mockResolvedValue([
      { id: "sp-del-1", userId: "u-del-1" },
      { id: "sp-del-2", userId: "u-del-2" },
    ]);
    inviteFindMany.mockResolvedValue([{ id: "inv-1", role: "PARENT" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1", "sp-del-2"] }));

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["sp-del-1", "sp-del-2"] },
        user: { role: "STUDENT" },
        enrollments: { none: { status: "GRADUATED" } },
      },
      select: { id: true, userId: true },
    });
    expect(inviteFindMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        OR: [
          { usedById: { in: ["u-del-1", "u-del-2"] } },
          { studentId: { in: ["sp-del-1", "sp-del-2"] } },
        ],
      },
      select: { id: true, role: true, status: true },
    });
    expect(inviteDeleteMany).not.toHaveBeenCalled();
    expect(userDeleteMany).not.toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-del-1", "u-del-2"] } },
      data: {
        status: "INACTIVE",
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u-del-1", "u-del-2"] } },
    });
  });

  it("삭제 대상 조회를 role: STUDENT로 다시 좁혀 승격된 계정을 뺀다", async () => {
    studentProfileFindMany.mockResolvedValue([]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["sp-del-1"] },
        user: { role: "STUDENT" },
        enrollments: { none: { status: "GRADUATED" } },
      },
      select: { id: true, userId: true },
    });
    expect(inviteDeleteMany).not.toHaveBeenCalled();
    expect(userDeleteMany).not.toHaveBeenCalled();
  });

  it("제외 대상 조회에서 졸업생을 트랜잭션 안에서 다시 제외한다", async () => {
    studentProfileFindMany.mockResolvedValue([{ id: "sp-del-1", userId: "u-del-1" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1", "sp-grad"] }));

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["sp-del-1", "sp-grad"] },
        user: { role: "STUDENT" },
        enrollments: { none: { status: "GRADUATED" } },
      },
      select: { id: true, userId: true },
    });
    expect(userDeleteMany).not.toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["u-del-1"] } },
    }));
  });

  it("계정 제외 표시는 재배정(enrollment 재생성)보다 먼저 끝낸다", async () => {
    studentProfileFindMany.mockResolvedValue([{ id: "sp-del-1", userId: "u-del-1" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    const removeOrder = userUpdateMany.mock.invocationCallOrder[0]!;
    for (const call of enrollmentCreateMany.mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(removeOrder);
    }
  });

  it("학생에게 달린 학부모 코드도 삭제 대상으로 잡는다", async () => {
    studentProfileFindMany.mockResolvedValue([{ id: "sp-del-1", userId: "u-del-1" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    const call = inviteFindMany.mock.calls[0]![0] as {
      where: { OR: { studentId?: { in: string[] } }[] };
    };
    expect(call.where.OR.some((c) => c.studentId?.in.includes("sp-del-1"))).toBe(true);
  });

  it("삭제한 대기 코드를 돌려줘야 서비스가 감사로그를 남길 수 있다", async () => {
    studentProfileFindMany.mockResolvedValue([{ id: "sp-del-1", userId: "u-del-1" }]);
    inviteFindMany.mockResolvedValue([
      { id: "inv-1", role: "PARENT" },
      { id: "inv-2", role: "PARENT" },
    ]);

    const result = await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    expect(result.revokedInvites).toEqual([
      { id: "inv-1", role: "PARENT" },
      { id: "inv-2", role: "PARENT" },
    ]);
  });

  it("폐기할 코드가 없으면 빈 배열을 돌려준다", async () => {
    studentProfileFindMany.mockResolvedValue([{ id: "sp-del-1", userId: "u-del-1" }]);
    inviteFindMany.mockResolvedValue([]);

    const result = await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    expect(inviteUpdateMany).not.toHaveBeenCalled();
    expect(inviteDeleteMany).not.toHaveBeenCalled();
    expect(result.revokedInvites).toEqual([]);
  });

  it("삭제 대상이 없으면 revokedInvites도 빈 배열이다", async () => {
    const result = await applyRoster(2026, input({ deleteStudentProfileIds: [] }));

    expect(inviteFindMany).not.toHaveBeenCalled();
    expect(result.revokedInvites).toEqual([]);
  });
});

describe("applyRoster()", () => {
  it("단일 withTransaction 안에서 처리하고 timeout/maxWait을 고정한다", async () => {
    await applyRoster(2026, input());

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(withTransaction.mock.calls[0]![1]).toEqual({ timeout: 120_000, maxWait: 10_000 });
  });

  it("tx가 전달되면 중첩 트랜잭션을 열지 않고 그 tx로 처리한다", async () => {
    await applyRoster(
      2026,
      input(),
      tx as unknown as NonNullable<Parameters<typeof applyRoster>[2]>,
    );

    expect(withTransaction).not.toHaveBeenCalled();
    expect(enrollmentDeleteMany).toHaveBeenCalledTimes(1);
  });

  it("managedStudentProfileIds 범위 밖 배정은 지우지 않는다", async () => {
    await applyRoster(2026, input({ managedStudentProfileIds: ["sp-1", "sp-2"] }));

    expect(enrollmentDeleteMany).toHaveBeenCalledWith({
      where: { year: 2026, studentProfileId: { in: ["sp-1", "sp-2"] } },
    });
  });

  it("지운 뒤 assignments를 전부 다시 만든다", async () => {
    await applyRoster(
      2026,
      input({
        assignments: [
          assignment({ studentProfileId: "sp-1" }),
          assignment({ studentProfileId: "sp-2", number: 4 }),
        ],
        managedStudentProfileIds: ["sp-1", "sp-2"],
      }),
    );

    expect(enrollmentCreateMany).toHaveBeenCalledTimes(1);
    expect(enrollmentCreateMany.mock.calls[0]![0].data).toHaveLength(2);

    const deleteOrder = enrollmentDeleteMany.mock.invocationCallOrder[0]!;
    for (const call of enrollmentCreateMany.mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(deleteOrder);
    }
  });

  it("statusChanged=false면 계정을 건드리지 않는다 (C1 회귀 방지)", async () => {
    await applyRoster(2026, input({ assignments: [assignment({ statusChanged: false })] }));

    expect(studentProfileFindMany).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("재배정처럼 학적은 그대로지만 소속이 바뀐 학생은 User.updatedAt을 bump한다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-1" }]);

    await applyRoster(
      2026,
      input({ assignments: [assignment({ line: 2, statusChanged: false, classNo: 4 })] }),
    );

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["sp-1"] } },
      select: { userId: true },
    });
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1"] } },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("비재학으로 바뀌면 계정을 잠그고 세션과 deletedAt을 지운다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-1" }]);

    await applyRoster(
      2026,
      input({
        assignments: [
          assignment({ statusChanged: true, status: "WITHDRAWN", grade: null, classNo: null, number: null }),
        ],
      }),
    );

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1"] } },
      data: { status: "INACTIVE", deletedAt: null, updatedAt: expect.any(Date) },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: { in: ["u-1"] } } });
  });

  it("재학으로 바뀌면 계정을 활성화하고 deletedAt을 지운다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-1" }]);

    await applyRoster(2026, input({ assignments: [assignment({ statusChanged: true })] }));

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1"] } },
      data: { status: "ACTIVE", deletedAt: null, updatedAt: expect.any(Date) },
    });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("학년·반을 Enrollment에 직접 저장하고 한 번의 createMany로 넣는다", async () => {
    await applyRoster(
      2026,
      input({
        assignments: [
          assignment({ studentProfileId: "sp-1", grade: 1, classNo: 3, number: 1 }),
          assignment({ studentProfileId: "sp-2", grade: 1, classNo: 3, number: 2 }),
          assignment({ studentProfileId: "sp-3", grade: 2, classNo: 1, number: 1 }),
        ],
        managedStudentProfileIds: ["sp-1", "sp-2", "sp-3"],
      }),
    );

    expect(enrollmentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          studentProfileId: "sp-1",
          year: 2026,
          grade: 1,
          classNo: 3,
          number: 1,
          status: "ENROLLED",
        },
        {
          studentProfileId: "sp-2",
          year: 2026,
          grade: 1,
          classNo: 3,
          number: 2,
          status: "ENROLLED",
        },
        {
          studentProfileId: "sp-3",
          year: 2026,
          grade: 2,
          classNo: 1,
          number: 1,
          status: "ENROLLED",
        },
      ],
    });
  });

  it("newStudents는 만료 시각과 함께 초대코드를 만든다", async () => {
    const expiresAt = new Date("2099-01-01");

    await applyRoster(
      2026,
      input({
        assignments: [],
        newStudents: [
          {
            row: {
              line: 2,
              studentCode: "",
              name: "새학생",
              birthDate: "2011-01-01",
              grade: 1,
              classNo: 3,
              number: 9,
              status: "ENROLLED",
              errors: [],
              studentProfileId: null,
              beforeName: null,
            },
            code: "GBSWNEW1",
          },
        ],
        inviteExpiresAt: expiresAt,
      }),
    );

    expect(inviteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "GBSWNEW1",
        role: "STUDENT",
        status: "PENDING",
        expiresAt,
        metadata: { name: "새학생", birthDate: "2011-01-01", grade: 1, classNo: 3, number: 9 },
      }),
    });
  });

  it("초대코드가 겹치면 InviteCodeCollisionError로 옮긴다 (I2 backstop)", async () => {
    inviteCreate.mockRejectedValue(realWorldCodeP2002());

    await expect(
      applyRoster(
        2026,
        input({
          assignments: [],
          newStudents: [
            {
              row: {
                line: 2,
                studentCode: "",
                name: "새학생",
                birthDate: "2011-01-01",
                grade: 1,
                classNo: 3,
                number: 9,
                status: "ENROLLED",
                errors: [],
                studentProfileId: null,
                beforeName: null,
              },
              code: "GBSWDUP1",
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(InviteCodeCollisionError);
  });

  it("명단 밖 계정이 붙들고 있는 (반, 번호)에 걸리면 NumberTakenError로 옮긴다", async () => {
    enrollmentCreateMany.mockRejectedValue(realWorldNumberP2002());

    await expect(applyRoster(2026, input())).rejects.toBeInstanceOf(NumberTakenError);
  });

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    enrollmentCreateMany.mockRejectedValue(boom);

    await expect(applyRoster(2026, input())).rejects.toBe(boom);
  });

  it("재학이 아닌 배정은 좌석 세 필드를 모두 null로 저장한다", async () => {
    await applyRoster(
      2026,
      input({
        assignments: [
          assignment({ status: "GRADUATED", grade: null, classNo: null, number: null }),
        ],
      }),
    );

    expect(enrollmentCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          grade: null,
          classNo: null,
          number: null,
          status: "GRADUATED",
        }),
      ],
    });
  });
});
