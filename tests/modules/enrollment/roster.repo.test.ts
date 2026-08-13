import { beforeEach, describe, expect, it, vi } from "vitest";

const enrollmentDeleteMany = vi.fn();
const enrollmentCreate = vi.fn();
const schoolClassUpsert = vi.fn();
const studentProfileFindMany = vi.fn();
const userUpdateMany = vi.fn();
const userDeleteMany = vi.fn();
const sessionDeleteMany = vi.fn();
const inviteCreate = vi.fn();
const inviteDeleteMany = vi.fn();
const transaction = vi.fn();

const tx = {
  enrollment: { deleteMany: enrollmentDeleteMany, create: enrollmentCreate },
  schoolClass: { upsert: schoolClassUpsert },
  studentProfile: { findMany: studentProfileFindMany },
  user: { updateMany: userUpdateMany, deleteMany: userDeleteMany },
  session: { deleteMany: sessionDeleteMany },
  invite: { create: inviteCreate, deleteMany: inviteDeleteMany },
};

vi.mock("@/core/db/client", () => ({
  prisma: {
    // applyRoster는 단일 트랜잭션 안에서 돈다 — 콜백에 tx를 그대로 넘겨 흉내 낸다.
    $transaction: transaction,
  },
}));

const { InviteCodeCollisionError, applyRoster } = await import(
  "@/modules/enrollment/roster.repo"
);

/** admin-user.repo.test.ts에서 관측한 것과 같은 모양의 실물 P2002 — Invite.code 버전. */
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

type ApplyInput = Parameters<typeof applyRoster>[1];
type RosterAssignment = ApplyInput["assignments"][number];

function assignment(overrides: Partial<RosterAssignment> = {}): RosterAssignment {
  return {
    line: 2,
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
    ...overrides,
  };
}

beforeEach(() => {
  enrollmentDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  enrollmentCreate.mockReset().mockResolvedValue(undefined);
  schoolClassUpsert.mockReset().mockResolvedValue({ id: "class-1" });
  studentProfileFindMany.mockReset().mockResolvedValue([]);
  userUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  userDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  sessionDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  inviteCreate.mockReset().mockResolvedValue(undefined);
  inviteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx));
});

describe("applyRoster() — 명단에서 빠진 학생 계정 삭제", () => {
  it("deleteStudentProfileIds가 비어 있으면 삭제 쿼리를 부르지 않는다", async () => {
    await applyRoster(2026, input({ deleteStudentProfileIds: [] }));

    expect(inviteDeleteMany).not.toHaveBeenCalled();
    expect(userDeleteMany).not.toHaveBeenCalled();
  });

  it("삭제 대상의 studentProfileId를 userId로 바꾼 뒤, 학부모 코드를 먼저 지우고 " +
    "계정을 지운다 — Invite.createdById가 Restrict라 순서가 바뀌면 계정 삭제가 막힌다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-del-1" }, { userId: "u-del-2" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1", "sp-del-2"] }));

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["sp-del-1", "sp-del-2"] }, user: { role: "STUDENT" } },
      select: { userId: true },
    });
    expect(inviteDeleteMany).toHaveBeenCalledWith({
      where: { createdById: { in: ["u-del-1", "u-del-2"] } },
    });
    expect(userDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-del-1", "u-del-2"] } },
    });
    const inviteDeleteOrder = inviteDeleteMany.mock.invocationCallOrder[0]!;
    const userDeleteOrder = userDeleteMany.mock.invocationCallOrder[0]!;
    expect(userDeleteOrder).toBeGreaterThan(inviteDeleteOrder);
  });

  it("삭제 대상 조회가 role: STUDENT로 다시 좁혀진다 (M2) — listExisting과 트랜잭션 " +
    "사이에 ADMIN으로 승격된 계정은 이 where 절 덕에 findMany 결과에서 빠져 지워지지 " +
    "않는다", async () => {
    studentProfileFindMany.mockResolvedValue([]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    expect(studentProfileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["sp-del-1"] }, user: { role: "STUDENT" } },
      select: { userId: true },
    });
    // findMany가 role 필터에 걸려 빈 배열을 돌려주면 지울 대상이 없다 — 승격된
    // 계정은 뒤이은 삭제 쿼리의 in절에 아예 등장하지 않는다.
    expect(userDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [] } } });
  });

  it("삭제는 재배정(enrollment 재생성)보다 먼저 끝낸다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-del-1" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1"] }));

    const userDeleteOrder = userDeleteMany.mock.invocationCallOrder[0]!;
    for (const call of enrollmentCreate.mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(userDeleteOrder);
    }
  });

  it("그 학생을 만든 초대(usedById)도 계정을 지우기 전에 지운다 (I1) — " +
    "SetNull이라 행만 남으면 metadata의 이름·생년월일이 삭제된 뒤에도 남는다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-del-1" }, { userId: "u-del-2" }]);

    await applyRoster(2026, input({ deleteStudentProfileIds: ["sp-del-1", "sp-del-2"] }));

    expect(inviteDeleteMany).toHaveBeenCalledWith({
      where: { usedById: { in: ["u-del-1", "u-del-2"] } },
    });

    // usedById 정리는 createdById 정리와 마찬가지로 user.deleteMany보다 먼저 끝나야
    // 한다 — 지운 뒤에는 usedById가 SetNull로 비어 어느 초대가 그 학생 것이었는지
    // 특정할 방법이 없다.
    const usedByIdCall = inviteDeleteMany.mock.calls.findIndex(
      (call) => (call[0] as { where: { usedById?: unknown } }).where.usedById !== undefined,
    );
    const usedByIdOrder = inviteDeleteMany.mock.invocationCallOrder[usedByIdCall]!;
    const userDeleteOrder = userDeleteMany.mock.invocationCallOrder[0]!;
    expect(userDeleteOrder).toBeGreaterThan(usedByIdOrder);
  });
});

describe("applyRoster()", () => {
  it("managedStudentProfileIds로 좁혀서만 지운다 (I5) — 관리 범위 밖 학생의 배정은 손대지 않는다", async () => {
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

    expect(enrollmentCreate).toHaveBeenCalledTimes(2);
    const deleteOrder = enrollmentDeleteMany.mock.invocationCallOrder[0]!;
    for (const call of enrollmentCreate.mock.invocationCallOrder) {
      expect(call).toBeGreaterThan(deleteOrder);
    }
  });

  it("statusChanged=false면 계정을 건드리지 않는다 (C1 회귀 방지)", async () => {
    await applyRoster(2026, input({ assignments: [assignment({ statusChanged: false })] }));

    expect(studentProfileFindMany).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("statusChanged=true고 비재학이면 계정을 잠그고 세션을 지운다", async () => {
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
      data: { status: "INACTIVE" },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: { in: ["u-1"] } } });
  });

  it("statusChanged=true고 재학이면 계정을 활성화한다", async () => {
    studentProfileFindMany.mockResolvedValue([{ userId: "u-1" }]);

    await applyRoster(2026, input({ assignments: [assignment({ statusChanged: true })] }));

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-1"] } },
      data: { status: "ACTIVE" },
    });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("반은 학생마다가 아니라 (학년,반) 쌍마다 한 번만 upsert한다", async () => {
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

    // 학생은 3명이지만 (학년,반) 쌍은 (1,3)과 (2,1) 둘뿐이다.
    expect(schoolClassUpsert).toHaveBeenCalledTimes(2);
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

  it("유일 제약과 무관한 오류는 삼키지 않는다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    enrollmentCreate.mockRejectedValue(boom);

    await expect(applyRoster(2026, input())).rejects.toBe(boom);
  });

  it("재학이 아닌 배정은 반을 만들지 않는다", async () => {
    await applyRoster(
      2026,
      input({
        assignments: [
          assignment({ status: "GRADUATED", grade: null, classNo: null, number: null }),
        ],
      }),
    );

    expect(schoolClassUpsert).not.toHaveBeenCalled();
    expect(enrollmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ classId: null, number: null, status: "GRADUATED" }),
    });
  });
});
