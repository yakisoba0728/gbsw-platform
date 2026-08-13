import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const insertInvite = vi.fn();
const codeExists = vi.fn();
const getStudentProfileByUserId = vi.fn();
const countActiveByStudent = vi.fn();
const listAll = vi.fn();
const listByStudent = vi.fn();
const findById = vi.fn();
const revokePending = vi.fn();
const findStudentById = vi.fn();
const listStudents = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/invites/invite.repo", () => ({
  insertInvite,
  codeExists,
  getStudentProfileByUserId,
  countActiveByStudent,
  listAll,
  listByStudent,
  findById,
  revokePending,
  findStudentById,
  listStudents,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const {
  createAdminInvite,
  createParentInvite,
  createParentInviteFor,
  createStudentInvite,
  listInvites,
  MAX_ACTIVE_PARENT_INVITES,
  revokeInvite,
} = await import("@/modules/invites/invite.service");

function user(role: SessionUser["role"], id = "u1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
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
  listAll.mockReset().mockResolvedValue([]);
  listByStudent.mockReset().mockResolvedValue([]);
  findById.mockReset();
  findStudentById.mockReset();
  listStudents.mockReset().mockResolvedValue([]);
  revokePending.mockReset().mockResolvedValue(1);
  recordAudit.mockReset();
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

  it("코드가 겹치면 다시 뽑는다", async () => {
    codeExists.mockResolvedValueOnce(true).mockResolvedValue(false);

    await createAdminInvite(admin, { name: "김교사" });

    expect(codeExists).toHaveBeenCalledTimes(2);
    expect(insertInvite).toHaveBeenCalledTimes(1);
  });
});

describe("학부모 코드 발급", () => {
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
    const arg = insertInvite.mock.calls[0]![0];
    expect(arg.role).toBe("PARENT");
    expect(arg.studentId).toBe("student-1");
  });

  it("살아 있는 코드가 한도에 차면 더 만들지 못한다", async () => {
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });
    countActiveByStudent.mockResolvedValue(MAX_ACTIVE_PARENT_INVITES);

    await expect(createParentInvite(student, { name: "김보호" })).rejects.toThrow(
      "TOO_MANY_ACTIVE_INVITES",
    );
    expect(insertInvite).not.toHaveBeenCalled();
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
});

describe("목록", () => {
  it("관리자만 전체 목록을 본다", async () => {
    await expect(listInvites(student)).rejects.toThrow("FORBIDDEN");
    await listInvites(admin);
    expect(listAll).toHaveBeenCalled();
  });
});

describe("폐기", () => {
  it("관리자는 아무 코드나 폐기할 수 있다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });

    await revokeInvite(admin, "inv1");

    expect(revokePending).toHaveBeenCalledWith("inv1");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "invite:revoke" }),
    );
  });

  it("학생은 자기 학부모 코드만 폐기할 수 있다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: "student-1" });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await revokeInvite(student, "inv1");

    expect(revokePending).toHaveBeenCalledWith("inv1");
  });

  it("남의 코드는 폐기하지 못한다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: "other-student" });
    getStudentProfileByUserId.mockResolvedValue({ id: "student-1" });

    await expect(revokeInvite(student, "inv1")).rejects.toThrow("FORBIDDEN");
    expect(revokePending).not.toHaveBeenCalled();
  });

  it("이미 사용됐거나 폐기된 코드는 실패로 알린다", async () => {
    findById.mockResolvedValue({ id: "inv1", studentId: null });
    revokePending.mockResolvedValue(0);

    await expect(revokeInvite(admin, "inv1")).rejects.toThrow("NOT_PENDING");
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
