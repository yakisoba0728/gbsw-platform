import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

vi.mock("server-only", () => ({}));

const insertInvite = vi.fn();
const codeExists = vi.fn();
const getStudentProfileByUserId = vi.fn();
const countActiveByStudent = vi.fn();
const lockStudentForParentInvite = vi.fn();
const listAll = vi.fn();
const listByStudent = vi.fn();
const findById = vi.fn();
const revokePending = vi.fn();
const findStudentById = vi.fn();
const listStudents = vi.fn();
const {
  recordAudit,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("invite-service-test");

vi.mock("@/modules/invites/invite.repo", () => ({
  insertInvite,
  codeExists,
  getStudentProfileByUserId,
  countActiveByStudent,
  lockStudentForParentInvite,
  listAll,
  listByStudent,
  findById,
  revokePending,
  findStudentById,
  listStudents,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const {
  createAdminInvite,
  createParentInvite,
  createParentInviteFor,
  createStudentInvite,
  issueInvitesBulk,
  InviteCodeCollisionError,
  listInvites,
  listMyParentInvites,
  listStudentsForInvite,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} = await import("@/modules/invites/invite.service");

const admin = user("ADMIN", "u1");
const student = user("STUDENT", "s-user");
const parent = user("PARENT", "p-user");

const studentInput = {
  name: "김학생",
  birthDate: "2010-03-04",
  grade: 1,
  classNo: 2,
  number: 15,
};

beforeEach(() => {
  insertInvite.mockReset().mockResolvedValue({ id: "inv1", code: "ABCD234XYZ" });
  codeExists.mockReset().mockResolvedValue(false);
  getStudentProfileByUserId.mockReset();
  countActiveByStudent.mockReset().mockResolvedValue(0);
  lockStudentForParentInvite.mockReset().mockResolvedValue(true);
  listAll.mockReset().mockResolvedValue([]);
  listByStudent.mockReset().mockResolvedValue([]);
  findById.mockReset();
  findStudentById.mockReset();
  listStudents.mockReset().mockResolvedValue([]);
  revokePending.mockReset().mockResolvedValue(1);
  recordAudit.mockReset();
  withTransaction.mockClear();
});

describe("관리자 코드 발급", () => {
  it("학생·학부모는 발급할 수 없다", async () => {
    await expect(createStudentInvite(student, studentInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(createAdminInvite(parent, { name: "김교사" })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(insertInvite).not.toHaveBeenCalled();
  });

  it("학생 코드에 사전등록 신원을 담는다", async () => {
    await createStudentInvite(admin, studentInput);

    const arg = insertInvite.mock.calls[0]![0];
    expect(arg.role).toBe("STUDENT");
    expect(arg.metadata).toEqual(studentInput);
    expect(arg.studentId).toBeUndefined();
    expect(arg.expiresAt).toBeNull();
  });

  it("유효기간을 주면 만료일이 붙는다", async () => {
    await createStudentInvite(admin, { ...studentInput, expiresInDays: 7 });

    const { expiresAt } = insertInvite.mock.calls[0]![0];
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("감사로그에 코드 값을 남기지 않는다", async () => {
    await createStudentInvite(admin, studentInput);

    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("invite:create");
    expect(JSON.stringify(audit)).not.toContain("ABCD234XYZ");
  });

  it("학생 코드 발급은 insert와 감사를 한 트랜잭션에 묶는다", async () => {
    await createStudentInvite(admin, studentInput);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(insertInvite.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });

  it("코드가 겹치면 다시 뽑는다", async () => {
    codeExists.mockResolvedValueOnce(true).mockResolvedValue(false);

    await createAdminInvite(admin, { name: "김교사" });

    expect(codeExists).toHaveBeenCalledTimes(2);
    expect(insertInvite).toHaveBeenCalledTimes(1);
  });

  it("관리자 코드 발급은 insert와 감사를 한 트랜잭션에 묶는다", async () => {
    await createAdminInvite(admin, { name: "김교사" });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(insertInvite.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });
});

describe("학부모 코드 발급", () => {
  it("학생 한 명은 학부모 코드를 두 장까지만 살려둘 수 있다", () => {
    expect(MAX_ACTIVE_PARENT_INVITES).toBe(2);
  });

  it("학부모는 만들 수 없다", async () => {
    await expect(createParentInvite(parent, { name: "김보호" })).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("이 경로는 학생 전용 — 프로필이 없으면 거부한다", async () => {
    getStudentProfileByUserId.mockResolvedValue(null);

    await expect(createParentInvite(admin, { name: "김보호" })).rejects.toThrow(
      "NOT_A_STUDENT",
    );
    expect(insertInvite).not.toHaveBeenCalled();
  });

  it("studentId를 세션에서 유도해 박는다 — 인자로 받지 않는다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await createParentInvite(student, { name: "김보호" });

    expect(getStudentProfileByUserId).toHaveBeenCalledWith("s-user");
    expect(lockStudentForParentInvite).toHaveBeenCalledWith(
      "student-1",
      txClient,
    );
    const arg = insertInvite.mock.calls[0]![0];
    expect(arg.role).toBe("PARENT");
    expect(arg.studentId).toBe("student-1");
    expect(arg.createdByName).toBe(student.name);
  });

  it("학생이 만든 학부모 코드는 입력 없이도 90일 뒤 만료한다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });
    const before = Date.now();

    await createParentInvite(student, { name: "김보호" });

    const { expiresAt } = insertInvite.mock.calls[0]![0];
    const after = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ninetyDays);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + ninetyDays);
  });

  it("살아 있는 코드가 한도에 차면 더 만들지 못한다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });
    countActiveByStudent.mockResolvedValue(MAX_ACTIVE_PARENT_INVITES);

    await expect(createParentInvite(student, { name: "김보호" })).rejects.toThrow(
      "TOO_MANY_ACTIVE_INVITES",
    );
    expect(insertInvite).not.toHaveBeenCalled();
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("학생 학부모 코드 발급은 한도 확인 뒤 insert와 감사를 한 트랜잭션에 묶는다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await createParentInvite(student, { name: "김보호" });

    expect(countActiveByStudent).toHaveBeenCalledWith(
      "student-1",
      expect.any(Date),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(insertInvite.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });
});

describe("관리자가 학생을 지정해 발급하는 학부모 코드", () => {
  it("관리자만 쓸 수 있다", async () => {
    await expect(
      createParentInviteFor(student, { studentId: "s1", name: "김보호" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(findStudentById).not.toHaveBeenCalled();
  });

  it("없는 학생이면 거부한다", async () => {
    findStudentById.mockResolvedValue(null);

    await expect(
      createParentInviteFor(admin, { studentId: "없음", name: "김보호" }),
    ).rejects.toThrow("STUDENT_NOT_FOUND");
    expect(insertInvite).not.toHaveBeenCalled();
  });

  it("지정한 학생에 귀속된 코드를 만든다", async () => {
    findStudentById.mockResolvedValue({ id: "student-9" });

    await createParentInviteFor(admin, { studentId: "student-9", name: "김보호" });

    const arg = insertInvite.mock.calls[0]![0];
    expect(arg.role).toBe("PARENT");
    expect(arg.studentId).toBe("student-9");
  });

  it("학생당 한도는 관리자 발급에도 똑같이 적용된다", async () => {
    findStudentById.mockResolvedValue({ id: "student-9" });
    countActiveByStudent.mockResolvedValue(MAX_ACTIVE_PARENT_INVITES);

    await expect(
      createParentInviteFor(admin, { studentId: "student-9", name: "김보호" }),
    ).rejects.toThrow("TOO_MANY_ACTIVE_INVITES");
  });

  it("관리자 학부모 코드 발급은 대상 확인 뒤 insert와 감사를 한 트랜잭션에 묶는다", async () => {
    findStudentById.mockResolvedValue({ id: "student-9" });

    await createParentInviteFor(admin, { studentId: "student-9", name: "김보호" });

    expect(findStudentById).toHaveBeenCalledWith("student-9");
    expect(lockStudentForParentInvite).toHaveBeenCalledWith(
      "student-9",
      txClient,
    );
    expect(countActiveByStudent).toHaveBeenCalledWith(
      "student-9",
      expect.any(Date),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(insertInvite.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
  });

  it("대상 학생이 잠금 전에 삭제되면 발급하지 않는다", async () => {
    findStudentById.mockResolvedValue({ id: "student-9" });
    lockStudentForParentInvite.mockResolvedValue(false);

    await expect(
      createParentInviteFor(admin, { studentId: "student-9", name: "김보호" }),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(countActiveByStudent).not.toHaveBeenCalled();
    expect(insertInvite).not.toHaveBeenCalled();
  });
});

describe("명단 대량 발급(issueInvitesBulk)", () => {
  const bulkTx = { bulk: "tx" } as never;

  function bulkInput(studentCount = 1) {
    return {
      actorId: "admin-1",
      actorName: "관리자",
      students: Array.from({ length: studentCount }, (_, i) => ({
        name: studentCount > 1 ? `새학생${i + 1}` : "새학생",
        birthDate: "2011-01-01",
        grade: 1,
        classNo: 3,
        number: 9 + i,
      })),
    };
  }

  function codeCollision() {
    return Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: {
        modelName: "Invite",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            originalCode: "23505",
            originalMessage:
              'duplicate key value violates unique constraint "Invite_code_key"',
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["code"] },
          },
        },
      },
    });
  }

  it("학생 수만큼 STUDENT 코드를 만들고 만료·발급자 스냅샷을 넣는다", async () => {
    insertInvite
      .mockResolvedValueOnce({ id: "inv-1", code: "GBSWAAAA2345" })
      .mockResolvedValueOnce({ id: "inv-2", code: "GBSWBBBB2345" });
    const before = Date.now();

    const issued = await issueInvitesBulk(bulkInput(2), bulkTx);
    const after = Date.now();

    expect(issued).toEqual([
      { id: "inv-1", name: "새학생1", code: "GBSWAAAA2345", grade: 1, classNo: 3, number: 9 },
      { id: "inv-2", name: "새학생2", code: "GBSWBBBB2345", grade: 1, classNo: 3, number: 10 },
    ]);

    const first = insertInvite.mock.calls[0]![0];
    expect(first.role).toBe("STUDENT");
    expect(first.createdById).toBe("admin-1");
    expect(first.createdByName).toBe("관리자");
    expect(first.expiresAt).toBeInstanceOf(Date);
    // before는 호출 전에 찍으므로 서비스가 자기 Date.now()로 만든 만료는 항상
    // before+90일 이상이다. 상한을 90일로 두면 1밀리초만 지나도 깨진다 —
    // 같은 파일의 부모 초대 검사처럼 after로 감싸 정확히 90일임을 본다.
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    expect(first.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + ninetyDays);
    expect(first.expiresAt!.getTime()).toBeLessThanOrEqual(after + ninetyDays);
    expect(first.metadata).toEqual({
      name: "새학생1",
      birthDate: "2011-01-01",
      grade: 1,
      classNo: 3,
      number: 9,
    });
    // 명단 반영 트랜잭션 안에서 실행된다.
    expect(insertInvite.mock.calls[0]![1]).toBe(bulkTx);
    expect(insertInvite.mock.calls[1]![1]).toBe(bulkTx);
  });

  it("사전 DB 검사 없이 코드를 만든다 — 코드가 안 겹치면 쿼리 한 번으로 끝난다", async () => {
    insertInvite.mockResolvedValue({ id: "inv-1", code: "GBSWAAAA2345" });

    await issueInvitesBulk(bulkInput(), bulkTx);

    expect(codeExists).not.toHaveBeenCalled();
    expect(insertInvite).toHaveBeenCalledTimes(1);
  });

  it("코드 유일 제약에 걸리면 중단된 tx를 재사용하지 않고 호출자에게 알린다", async () => {
    insertInvite.mockRejectedValueOnce(codeCollision());

    await expect(issueInvitesBulk(bulkInput(), bulkTx)).rejects.toBeInstanceOf(
      InviteCodeCollisionError,
    );

    expect(insertInvite).toHaveBeenCalledTimes(1);
    expect(codeExists).not.toHaveBeenCalled();
  });

  it("같은 트랜잭션에서는 충돌 재시도를 하지 않는다", async () => {
    insertInvite.mockRejectedValue(codeCollision());

    await expect(issueInvitesBulk(bulkInput(), bulkTx)).rejects.toBeInstanceOf(
      InviteCodeCollisionError,
    );
    expect(insertInvite).toHaveBeenCalledTimes(1);
  });

  it("코드와 무관한 오류는 그대로 전파한다", async () => {
    const boom = new Error("연결이 끊겼습니다");
    insertInvite.mockRejectedValue(boom);

    await expect(issueInvitesBulk(bulkInput(), bulkTx)).rejects.toBe(boom);
  });
});

describe("목록", () => {
  it("관리자만 전체 목록을 본다", async () => {
    await expect(listInvites(student)).rejects.toThrow("FORBIDDEN");
    await listInvites(admin);
    expect(listAll).toHaveBeenCalled();
  });

  it("학부모 코드 발급용 학생 목록도 관리자만 본다", async () => {
    await expect(listStudentsForInvite(student)).rejects.toThrow("FORBIDDEN");
    await expect(listStudentsForInvite(parent)).rejects.toThrow("FORBIDDEN");
    expect(listStudents).not.toHaveBeenCalled();

    await listStudentsForInvite(admin);
    expect(listStudents).toHaveBeenCalledWith(2026);
  });

  it("학생 목록 조회 거부도 감사로그에 남긴다 (I5)", async () => {
    await expect(listStudentsForInvite(student)).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: student.id,
        action: "authz:denied",
        targetType: "Authz",
        metadata: { action: "invite:create" },
      }),
    );
  });
});

describe("폐기", () => {
  it("관리자는 아무 코드나 폐기할 수 있다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });

    await revokeInvite(admin, { inviteId: "inv1", reason: "잘못 발급" });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(revokePending).toHaveBeenCalledWith("inv1", txClient);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "invite:revoke" }),
      txClient,
    );
  });

  it("사유를 감사로그에 남긴다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });

    await revokeInvite(admin, { inviteId: "inv1", reason: "잘못된 학생에게 발급함" });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "invite:revoke",
        metadata: { reason: "잘못된 학생에게 발급함" },
      }),
      txClient,
    );
  });

  it("학생은 자기 학부모 코드만 폐기할 수 있다", async () => {
    findById.mockResolvedValue({
      id: "inv1",
      role: "PARENT",
      studentId: "student-1",
      createdById: student.id,
    });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await revokeInvite(student, { inviteId: "inv1", reason: "잘못 발급" });

    expect(revokePending).toHaveBeenCalledWith("inv1", txClient);
  });

  it("학생은 교사가 발급했어도 자기에게 귀속된 학부모 코드를 폐기할 수 있다", async () => {
    findById.mockResolvedValue({
      id: "inv1",
      role: "PARENT",
      studentId: "student-1",
      createdById: admin.id,
    });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await revokeInvite(student, { inviteId: "inv1", reason: "다시 발급" });

    expect(revokePending).toHaveBeenCalledWith("inv1", txClient);
    expect(recordAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz:denied" }),
    );
  });

  it("학생에게 귀속됐어도 교사 초대코드는 폐기할 수 없다", async () => {
    findById.mockResolvedValue({
      id: "inv1",
      role: "ADMIN",
      studentId: "student-1",
      createdById: admin.id,
    });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await expect(
      revokeInvite(student, { inviteId: "inv1", reason: "역할이 다름" }),
    ).rejects.toThrow("FORBIDDEN");

    expect(revokePending).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: student.id,
        action: "authz:denied",
        targetType: "Invite",
      }),
    );
  });

  it("남의 코드는 폐기하지 못한다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: "other-student" });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await expect(revokeInvite(student, { inviteId: "inv1", reason: "잘못 발급" })).rejects.toThrow("FORBIDDEN");
    expect(revokePending).not.toHaveBeenCalled();
  });

  it("소유권 거부도 감사로그에 남긴다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: "other-student" });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await expect(revokeInvite(student, { inviteId: "inv1", reason: "잘못 발급" })).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: student.id,
        action: "authz:denied",
        targetType: "Invite",
        targetId: "inv1",
        metadata: { action: "invite:revoke" },
      }),
    );
  });

  it("이미 사용됐거나 폐기된 코드는 실패로 알린다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });
    revokePending.mockResolvedValue(0);

    await expect(revokeInvite(admin, { inviteId: "inv1", reason: "잘못 발급" })).rejects.toThrow("NOT_PENDING");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("이미 사용된 코드 폐기 실패는 트랜잭션 안에서 감사 없이 되돌린다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });
    revokePending.mockResolvedValue(0);

    await expect(revokeInvite(admin, { inviteId: "inv1", reason: "잘못 발급" })).rejects.toThrow("NOT_PENDING");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(revokePending).toHaveBeenCalledWith("inv1", txClient);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("listMyParentInvites() — 세션에서만 유도한다", () => {
  it("두 번째 인자로 남의 학생 id를 넣어도 세션 학생만 조회한다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "sp-mine" });

    await (listMyParentInvites as (...args: unknown[]) => Promise<unknown>)(
      student,
      "sp-남의학생",
    );

    expect(getStudentProfileByUserId).toHaveBeenCalledWith(student.id);
    expect(listByStudent).toHaveBeenCalledWith("sp-mine");
    expect(listByStudent).not.toHaveBeenCalledWith("sp-남의학생");
  });

  it("학생 프로필이 없으면 빈 목록이다 — 코드가 새지 않는다", async () => {
    getStudentProfileByUserId.mockResolvedValue(null);

    await expect(listMyParentInvites(admin)).resolves.toEqual([]);
    expect(listByStudent).not.toHaveBeenCalled();
  });
});
