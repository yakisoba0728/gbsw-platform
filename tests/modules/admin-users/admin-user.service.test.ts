import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listUsersRepo = vi.fn();
const findById = vi.fn();
const findDetail = vi.fn();
const findRelatedAudit = vi.fn();
const updateProfile = vi.fn();
const updateEnrollment = vi.fn();
const setStatus = vi.fn();
const setMustChangePassword = vi.fn();
const replaceCredentialPassword = vi.fn();
const deleteSessions = vi.fn();
const recordAudit = vi.fn();

class EmailTakenError extends Error {}

vi.mock("@/modules/admin-users/admin-user.repo", () => ({
  EmailTakenError,
  listUsers: listUsersRepo,
  findById,
  findDetail,
  findRelatedAudit,
  updateProfile,
  updateEnrollment,
  setStatus,
  setMustChangePassword,
  replaceCredentialPassword,
  deleteSessions,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const { listUsers, resetPassword, setUserActive, updateUser } = await import(
  "@/modules/admin-users/admin-user.service"
);

/** KST 자정으로 저장되는 생년월일 */
const BIRTH = new Date("2010-07-15T00:00:00+09:00");

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-9",
    name: "김학생",
    email: "student@gbsw.hs.kr",
    phone: "010-1111-2222",
    studentProfile: {
      id: "sp-1",
      birthDate: BIRTH,
      enrollments: [
        { id: "en-1", number: 15, status: "ENROLLED", schoolClass: { grade: 1, classNo: 2 } },
      ],
    },
    ...overrides,
  };
}

const sameInput = {
  name: "김학생",
  email: "student@gbsw.hs.kr",
  phone: "010-1111-2222",
  birthDate: "2010-07-15",
  grade: 1,
  classNo: 2,
  number: 15,
};

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
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
const student = user("STUDENT", "s-1");

beforeEach(() => {
  listUsersRepo.mockReset().mockResolvedValue([]);
  findById.mockReset().mockResolvedValue({ id: "u-9", name: "대상" });
  findDetail.mockReset().mockResolvedValue(detail());
  findRelatedAudit.mockReset().mockResolvedValue([]);
  updateProfile.mockReset();
  updateEnrollment.mockReset();
  setStatus.mockReset();
  setMustChangePassword.mockReset();
  replaceCredentialPassword.mockReset().mockResolvedValue(1);
  deleteSessions.mockReset();
  recordAudit.mockReset();
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listUsers(student)).rejects.toThrow("FORBIDDEN");
    await expect(setUserActive(student, "u-9", false)).rejects.toThrow("FORBIDDEN");
    await expect(resetPassword(student, "u-9")).rejects.toThrow("FORBIDDEN");
    expect(setStatus).not.toHaveBeenCalled();
    expect(replaceCredentialPassword).not.toHaveBeenCalled();
  });
});

describe("setUserActive()", () => {
  it("비활성화하면 세션도 끊는다", async () => {
    await setUserActive(admin, "u-9", false);

    expect(setStatus).toHaveBeenCalledWith("u-9", "INACTIVE");
    expect(deleteSessions).toHaveBeenCalledWith("u-9");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user:deactivate", targetId: "u-9" }),
    );
  });

  it("활성화는 세션을 건드리지 않는다", async () => {
    await setUserActive(admin, "u-9", true);

    expect(setStatus).toHaveBeenCalledWith("u-9", "ACTIVE");
    expect(deleteSessions).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user:activate" }),
    );
  });

  it("자기 계정은 비활성화하지 못한다 — 스스로를 가두는 걸 막는다", async () => {
    await expect(setUserActive(admin, admin.id, false)).rejects.toThrow(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("자기 계정을 다시 활성화하는 건 막지 않는다", async () => {
    await expect(setUserActive(admin, admin.id, true)).resolves.toBeUndefined();
  });

  it("없는 계정이면 아무것도 바꾸지 않는다", async () => {
    findById.mockResolvedValue(null);

    await expect(setUserActive(admin, "없음", false)).rejects.toThrow("NOT_FOUND");
    expect(setStatus).not.toHaveBeenCalled();
  });
});

describe("resetPassword()", () => {
  it("임시 비밀번호를 돌려주되 해시로 저장한다", async () => {
    const { tempPassword } = await resetPassword(admin, "u-9");

    expect(tempPassword).toHaveLength(14);

    const [, storedHash] = replaceCredentialPassword.mock.calls[0]!;
    expect(storedHash).not.toBe(tempPassword);
    expect(storedHash.length).toBeGreaterThan(20);
  });

  it("다음 로그인에 변경을 강제하고 기존 세션을 끊는다", async () => {
    await resetPassword(admin, "u-9");

    expect(setMustChangePassword).toHaveBeenCalledWith("u-9", true);
    expect(deleteSessions).toHaveBeenCalledWith("u-9");
  });

  it("임시 비밀번호를 감사로그에 남기지 않는다", async () => {
    const { tempPassword } = await resetPassword(admin, "u-9");

    expect(JSON.stringify(recordAudit.mock.calls[0]![0])).not.toContain(
      tempPassword,
    );
  });

  it("비밀번호 로그인 수단이 없으면 거부한다", async () => {
    replaceCredentialPassword.mockResolvedValue(0);

    await expect(resetPassword(admin, "u-9")).rejects.toThrow(
      "NO_CREDENTIAL_ACCOUNT",
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("호출할 때마다 다른 비밀번호가 나온다", async () => {
    const a = await resetPassword(admin, "u-9");
    const b = await resetPassword(admin, "u-9");
    expect(a.tempPassword).not.toBe(b.tempPassword);
  });
});

describe("updateUser()", () => {
  it("관리자가 아니면 못 고친다", async () => {
    await expect(updateUser(student, "u-9", sameInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("바뀐 게 없으면 저장도 기록도 하지 않는다", async () => {
    const { changed } = await updateUser(admin, "u-9", sameInput);

    expect(changed).toEqual([]);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(updateEnrollment).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("달라진 항목만 골라낸다", async () => {
    const { changed } = await updateUser(admin, "u-9", {
      ...sameInput,
      name: "김학생2",
      classNo: 5,
    });

    expect(changed).toEqual(["name", "classNo"]);
  });

  it("감사로그에 값이 아니라 바뀐 항목 이름만 남긴다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, phone: "010-9999-8888" });

    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("user:update");
    expect(audit.metadata).toEqual({ changed: ["phone"] });
    // 새 전화번호가 로그에 남으면 감사로그가 개인정보 사본이 된다.
    expect(JSON.stringify(audit)).not.toContain("9999");
  });

  it("이름·이메일·전화번호를 함께 저장한다 — 셋 다 필수라 비울 수 없다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, phone: "010-9999-8888" });

    expect(updateProfile).toHaveBeenCalledWith("u-9", {
      name: "김학생",
      email: "student@gbsw.hs.kr",
      phone: "010-9999-8888",
    });
  });

  it("이메일이 바뀌면 changed에 잡힌다", async () => {
    const { changed } = await updateUser(admin, "u-9", {
      ...sameInput,
      email: "new@gbsw.hs.kr",
    });

    expect(changed).toEqual(["email"]);
  });

  it("이미 쓰이는 이메일이면 EMAIL_TAKEN으로 옮긴다", async () => {
    updateProfile.mockRejectedValue(new EmailTakenError());

    await expect(
      updateUser(admin, "u-9", { ...sameInput, email: "taken@gbsw.hs.kr" }),
    ).rejects.toThrow("EMAIL_TAKEN");
    // 저장이 실패했으므로 감사로그도 남지 않는다.
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("감사로그에 이메일 값이 아니라 항목 이름만 남긴다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, email: "new@gbsw.hs.kr" });

    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.metadata).toEqual({ changed: ["email"] });
    expect(JSON.stringify(audit)).not.toContain("new@gbsw.hs.kr");
  });

  it("소속이 바뀌면 학생 소속만 갱신한다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, grade: 2 });

    expect(updateEnrollment).toHaveBeenCalledTimes(1);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(updateEnrollment.mock.calls[0]![1]).toBe(2026);
    expect(updateEnrollment.mock.calls[0]![2].grade).toBe(2);
  });

  it("생년월일은 KST 자정으로 저장한다 — 하루 밀리면 안 된다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, birthDate: "2011-01-01" });

    const saved: Date = updateEnrollment.mock.calls[0]![2].birthDate;
    expect(saved.toISOString()).toBe("2010-12-31T15:00:00.000Z");
  });

  it("학생이 아니면 소속 항목을 무시한다", async () => {
    findDetail.mockResolvedValue(detail({ studentProfile: null }));

    const { changed } = await updateUser(admin, "u-9", {
      ...sameInput,
      grade: 3,
    });

    expect(changed).toEqual([]);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it("없는 계정이면 거부한다", async () => {
    findDetail.mockResolvedValue(null);

    await expect(updateUser(admin, "없음", sameInput)).rejects.toThrow(
      "NOT_FOUND",
    );
  });
});
