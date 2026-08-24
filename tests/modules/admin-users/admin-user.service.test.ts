import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listUsersRepo = vi.fn();
const findById = vi.fn();
const findDetail = vi.fn();
const findRelatedAudit = vi.fn();
const updateUserAndEnrollment = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const findCurrentYear = vi.fn();
const setActive = vi.fn();
const resetCredential = vi.fn();
const deletePermanently = vi.fn();
const recordAudit = vi.fn();
const withTransaction = vi.fn();
const tx = { tx: true };

class EmailTakenError extends Error {}
class NumberTakenError extends Error {}
class UserRevisionConflictError extends Error {}

vi.mock("@/modules/admin-users/admin-user.repo", () => ({
  EmailTakenError,
  NumberTakenError,
  UserRevisionConflictError,
  listUsers: listUsersRepo,
  findById,
  findDetail,
  findRelatedAudit,
  updateUserAndEnrollment,
  findCurrentYearForUpdate,
  findCurrentYear,
  setActive,
  resetCredential,
  deletePermanently,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const {
  deleteUserPermanently,
  getUserDetail,
  listUsers,
  resetPassword,
  setUserActive,
  updateUser,
} = await import("@/modules/admin-users/admin-user.service");

/** KST 자정으로 저장되는 생년월일 */
const BIRTH = new Date("2010-07-15T00:00:00+09:00");
const REVISION = new Date("2026-08-19T00:00:00.000Z");

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-9",
    name: "김학생",
    email: "student@gbsw.hs.kr",
    phone: "010-1111-2222",
    deletedAt: null,
    updatedAt: REVISION,
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
  updatedAt: REVISION,
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
    deletedAt: null,
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

beforeEach(() => {
  listUsersRepo.mockReset().mockResolvedValue([]);
  findById.mockReset().mockResolvedValue({ id: "u-9", name: "대상", role: "STUDENT", deletedAt: null });
  findDetail.mockReset().mockResolvedValue(detail());
  findRelatedAudit.mockReset().mockResolvedValue([]);
  updateUserAndEnrollment.mockReset().mockResolvedValue(undefined);
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  findCurrentYear.mockReset().mockResolvedValue(2026);
  setActive.mockReset().mockResolvedValue(undefined);
  resetCredential.mockReset().mockResolvedValue(1);
  deletePermanently.mockReset().mockResolvedValue(true);
  recordAudit.mockReset();
  withTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listUsers(student)).rejects.toThrow("FORBIDDEN");
    await expect(setUserActive(student, "u-9", false)).rejects.toThrow("FORBIDDEN");
    await expect(resetPassword(student, "u-9")).rejects.toThrow("FORBIDDEN");
    expect(setActive).not.toHaveBeenCalled();
    expect(resetCredential).not.toHaveBeenCalled();
  });

  it("권한 거부를 감사로그에 남긴다 (I5) — 학생이 서버 액션을 직접 호출해도 흔적이 남는다", async () => {
    await expect(listUsers(student)).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: student.id,
        action: "authz:denied",
        targetType: "Authz",
        metadata: { action: "user:manage" },
      }),
    );
  });
});

describe("getUserDetail()", () => {
  it("관리자가 아니면 상세를 볼 수 없다 — 개인정보와 감사로그 20건이 함께 나간다", async () => {
    await expect(getUserDetail(student, "u-1")).rejects.toThrow("FORBIDDEN");

    expect(findDetail).not.toHaveBeenCalled();
    expect(findRelatedAudit).not.toHaveBeenCalled();
  });

  it("권한 거부를 감사로그에 남긴다 (I5)", async () => {
    await expect(getUserDetail(student, "u-1")).rejects.toThrow("FORBIDDEN");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: student.id,
        action: "authz:denied",
        targetType: "Authz",
        metadata: { action: "user:manage" },
      }),
    );
  });

  it("관리자에게는 계정과 관련 감사로그를 함께 준다", async () => {
    findRelatedAudit.mockResolvedValue([{ id: "a-1" }]);

    const result = await getUserDetail(admin, "u-9");

    expect(findDetail).toHaveBeenCalledWith("u-9", 2026);
    expect(findRelatedAudit).toHaveBeenCalledWith("u-9", 20);
    expect(result.user).toMatchObject({ id: "u-9" });
    expect(result.audit).toEqual([{ id: "a-1" }]);
  });

  it("없는 계정이면 감사로그를 긁지 않는다", async () => {
    findDetail.mockResolvedValue(null);

    await expect(getUserDetail(admin, "없음")).rejects.toThrow("NOT_FOUND");
    expect(findRelatedAudit).not.toHaveBeenCalled();
  });
});

describe("setUserActive()", () => {
  it("비활성화하면 세션도 끊는다 (repo.setActive가 트랜잭션으로 처리)", async () => {
    await setUserActive(admin, "u-9", false);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith("u-9", false, tx);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user:deactivate", targetId: "u-9" }),
      tx,
    );
  });

  it("활성화도 repo.setActive 한 번으로 처리한다", async () => {
    await setUserActive(admin, "u-9", true);

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith("u-9", true, tx);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user:activate" }),
      tx,
    );
  });

  it("자기 계정은 비활성화하지 못한다 — 스스로를 가두는 걸 막는다", async () => {
    await expect(setUserActive(admin, admin.id, false)).rejects.toThrow(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(setActive).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("자기 계정을 다시 활성화하는 건 막지 않는다", async () => {
    await expect(setUserActive(admin, admin.id, true)).resolves.toBeUndefined();
  });

  it("없는 계정이면 아무것도 바꾸지 않는다", async () => {
    findById.mockResolvedValue(null);

    await expect(setUserActive(admin, "없음", false)).rejects.toThrow("NOT_FOUND");
    expect(setActive).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("명단에서 빠진 계정은 상태를 바꾸지 못한다", async () => {
    findById.mockResolvedValue({ id: "u-9", name: "대상", deletedAt: new Date() });

    await expect(setUserActive(admin, "u-9", true)).rejects.toThrow("ACCOUNT_DELETED");
    expect(setActive).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

describe("resetPassword()", () => {
  it("임시 비밀번호를 돌려주되 해시로 저장한다", async () => {
    const { tempPassword } = await resetPassword(admin, "u-9");

    expect(tempPassword).toHaveLength(14);

    const [, storedHash] = resetCredential.mock.calls[0]!;
    expect(storedHash).not.toBe(tempPassword);
    expect(storedHash.length).toBeGreaterThan(20);
  });

  it("강제 변경·세션 삭제와 감사로그를 같은 tx에서 끝낸다 (M11)", async () => {
    await resetPassword(admin, "u-9");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(resetCredential).toHaveBeenCalledTimes(1);
    expect(resetCredential.mock.calls[0]![2]).toBe(tx);
    expect(recordAudit.mock.calls[0]![1]).toBe(tx);
  });

  it("임시 비밀번호를 감사로그에 남기지 않는다", async () => {
    const { tempPassword } = await resetPassword(admin, "u-9");

    expect(JSON.stringify(recordAudit.mock.calls[0]![0])).not.toContain(
      tempPassword,
    );
  });

  it("비밀번호 로그인 수단이 없으면 거부한다", async () => {
    resetCredential.mockResolvedValue(0);

    await expect(resetPassword(admin, "u-9")).rejects.toThrow(
      "NO_CREDENTIAL_ACCOUNT",
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("legacy 삭제 표시가 남은 계정은 비밀번호를 초기화하지 못한다", async () => {
    findById.mockResolvedValue({ id: "u-9", name: "대상", deletedAt: new Date() });

    await expect(resetPassword(admin, "u-9")).rejects.toThrow("ACCOUNT_DELETED");
    expect(resetCredential).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
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
    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
  });

  it("바뀐 게 없으면 저장도 기록도 하지 않는다", async () => {
    const { changed } = await updateUser(admin, "u-9", sameInput);

    expect(changed).toEqual([]);
    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
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

  it("이름·이메일·전화번호와 감사로그를 같은 tx에서 저장한다 (I1)", async () => {
    await updateUser(admin, "u-9", { ...sameInput, phone: "010-9999-8888" });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(updateUserAndEnrollment).toHaveBeenCalledTimes(1);
    expect(updateUserAndEnrollment).toHaveBeenCalledWith("u-9", {
      expectedUpdatedAt: REVISION,
      profile: { name: "김학생", email: "student@gbsw.hs.kr", phone: "010-9999-8888" },
      studentProfile: null,
      enrollment: null,
    }, tx);
    expect(recordAudit.mock.calls[0]![1]).toBe(tx);
  });

  it("이메일이 바뀌면 changed에 잡힌다", async () => {
    const { changed } = await updateUser(admin, "u-9", {
      ...sameInput,
      email: "new@gbsw.hs.kr",
    });

    expect(changed).toEqual(["email"]);
  });

  it("이미 쓰이는 이메일이면 EMAIL_TAKEN으로 옮긴다", async () => {
    updateUserAndEnrollment.mockRejectedValue(new EmailTakenError());

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

  it("소속이 바뀌면 profile은 null로, enrollment만 채워서 한 번에 저장한다 (I1)", async () => {
    await updateUser(admin, "u-9", { ...sameInput, grade: 2 });

    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(tx);
    expect(updateUserAndEnrollment).toHaveBeenCalledTimes(1);
    const [, arg] = updateUserAndEnrollment.mock.calls[0]!;
    expect(arg.profile).toBeNull();
    // 생년월일은 바뀌지 않았으므로 studentProfile 버킷은 비어 있다.
    expect(arg.studentProfile).toBeNull();
    expect(arg.enrollment).toMatchObject({ studentProfileId: "sp-1", year: 2026, grade: 2 });
  });

  it("이름·소속이 함께 바뀌면 한 번의 호출에 둘 다 담아 보낸다 (I1)", async () => {
    await updateUser(admin, "u-9", { ...sameInput, name: "새이름", grade: 2 });

    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(tx);
    expect(updateUserAndEnrollment).toHaveBeenCalledTimes(1);
    const [, arg] = updateUserAndEnrollment.mock.calls[0]!;
    expect(arg.profile).not.toBeNull();
    expect(arg.enrollment).not.toBeNull();
  });

  it("소속 변경 저장 직전 현재 학년도가 바뀌었으면 구년도 소속을 수정하지 않는다", async () => {
    findCurrentYearForUpdate.mockResolvedValue(2027);

    await expect(updateUser(admin, "u-9", { ...sameInput, grade: 2 })).rejects.toThrow("YEAR_CHANGED");

    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("Serializable 학년도 전환 충돌은 YEAR_CHANGED로 돌려준다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));
    findCurrentYear.mockResolvedValue(2027);

    await expect(updateUser(admin, "u-9", { ...sameInput, grade: 2 })).rejects.toThrow("YEAR_CHANGED");
  });

  it("Serializable 같은 학년도 충돌은 USER_CHANGED로 돌려준다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));
    findCurrentYear.mockResolvedValue(2026);

    await expect(updateUser(admin, "u-9", { ...sameInput, grade: 2 })).rejects.toThrow("USER_CHANGED");
  });

  it("이미 그 반·번호를 쓰는 학생이 있으면 NUMBER_TAKEN으로 옮긴다", async () => {
    updateUserAndEnrollment.mockRejectedValue(new NumberTakenError());

    await expect(
      updateUser(admin, "u-9", { ...sameInput, grade: 2 }),
    ).rejects.toThrow("NUMBER_TAKEN");
    // 저장이 실패했으므로 감사로그도 남지 않는다.
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("다른 관리자가 먼저 저장했으면 USER_CHANGED로 옮기고 감사로그를 남기지 않는다", async () => {
    updateUserAndEnrollment.mockRejectedValue(new UserRevisionConflictError());

    await expect(
      updateUser(admin, "u-9", { ...sameInput, phone: "010-9999-8888" }),
    ).rejects.toThrow("USER_CHANGED");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("생년월일은 KST 자정으로 저장한다 — 하루 밀리면 안 된다", async () => {
    await updateUser(admin, "u-9", { ...sameInput, birthDate: "2011-01-01" });

    const [, arg] = updateUserAndEnrollment.mock.calls[0]!;
    // 생년월일만 바뀌었으므로 studentProfile 버킷에 담겨 간다 — 학년·반·번호가
    // 바뀌지 않았으니 enrollment는 안 건드린다.
    expect(arg.enrollment).toBeNull();
    const saved: Date = arg.studentProfile.birthDate;
    expect(saved.toISOString()).toBe("2010-12-31T15:00:00.000Z");
  });

  it("학생이 아니면 소속 항목을 무시한다", async () => {
    findDetail.mockResolvedValue(detail({ studentProfile: null }));

    const { changed } = await updateUser(admin, "u-9", {
      ...sameInput,
      grade: 3,
    });

    expect(changed).toEqual([]);
    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
  });

  it("없는 계정이면 거부한다", async () => {
    findDetail.mockResolvedValue(null);

    await expect(updateUser(admin, "없음", sameInput)).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("legacy 삭제 표시가 남은 계정은 정보를 고치지 못한다", async () => {
    findDetail.mockResolvedValue(detail({ deletedAt: new Date() }));

    await expect(updateUser(admin, "u-9", sameInput)).rejects.toThrow(
      "ACCOUNT_DELETED",
    );
    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
  });

  it("학년·반·번호 중 하나라도 비면 값을 지어내지 않고 거부한다 (M10)", async () => {
    // number를 아예 안 보낸다 — 예전엔 enrollment?.number ?? 1로 1번을 지어냈다.
    const withoutNumber = {
      updatedAt: REVISION,
      name: sameInput.name,
      email: sameInput.email,
      phone: sameInput.phone,
      birthDate: sameInput.birthDate,
      grade: 2,
      classNo: sameInput.classNo,
    };

    await expect(updateUser(admin, "u-9", withoutNumber)).rejects.toThrow(
      "INCOMPLETE_STUDENT_INPUT",
    );
    expect(updateUserAndEnrollment).not.toHaveBeenCalled();
  });

  describe("재학 중이 아닌 학생 (I2 — 졸업생 편집)", () => {
    function graduated(overrides: Record<string, unknown> = {}) {
      return detail({
        studentProfile: {
          id: "sp-1",
          birthDate: BIRTH,
          enrollments: [
            {
              id: "en-1",
              number: null,
              status: "GRADUATED",
              schoolClass: null,
            },
          ],
        },
        ...overrides,
      });
    }

    it("학년·반·번호를 보내지 않아도 생년월일만 고칠 수 있다", async () => {
      findDetail.mockResolvedValue(graduated());

      const { changed } = await updateUser(admin, "u-9", {
        name: "김학생",
        updatedAt: REVISION,
        email: "student@gbsw.hs.kr",
        phone: "010-1111-2222",
        birthDate: "2011-01-01",
        // 학년·반·번호는 아예 안 보낸다 — 폼에서 칸이 숨겨져 있다.
      });

      expect(changed).toEqual(["birthDate"]);
      expect(updateUserAndEnrollment).toHaveBeenCalledWith("u-9", {
        expectedUpdatedAt: REVISION,
        profile: null,
        studentProfile: {
          studentProfileId: "sp-1",
          birthDate: new Date("2010-12-31T15:00:00.000Z"),
        },
        enrollment: null,
      }, tx);
    });

    it("학년·반·번호가 함께 와도 학적을 되돌리지 않는다 — 애초에 바뀐 것으로도 안 잡는다", async () => {
      findDetail.mockResolvedValue(graduated());

      // 서버 액션을 직접 호출하는 등으로 grade/classNo/number가 섞여 들어와도
      // (defense-in-depth) 재학 중이 아니면 소속 항목은 무시한다.
      const { changed } = await updateUser(admin, "u-9", {
        ...sameInput,
        birthDate: "2010-07-15",
      });

      expect(changed).toEqual([]);
      expect(updateUserAndEnrollment).not.toHaveBeenCalled();
    });
  });
});

describe("deleteUserPermanently() — 학생 오등록 정리 전용, 되돌릴 수 없다", () => {
  const target = { id: "u-9", name: "삭제대상", role: "STUDENT", deletedAt: null };

  it("관리자가 아니면 삭제하지 못한다", async () => {
    await expect(
      deleteUserPermanently(student, "u-9", "삭제대상"),
    ).rejects.toThrow("FORBIDDEN");
    expect(deletePermanently).not.toHaveBeenCalled();
  });

  it("자기 자신은 삭제하지 못한다 — DB 조회보다 먼저 막는다", async () => {
    await expect(
      deleteUserPermanently(admin, admin.id, "테스트"),
    ).rejects.toThrow("CANNOT_DELETE_SELF");
    expect(deletePermanently).not.toHaveBeenCalled();
  });

  it("없는 계정이면 거부한다", async () => {
    findById.mockResolvedValue(null);

    await expect(
      deleteUserPermanently(admin, "없음", "아무개"),
    ).rejects.toThrow("NOT_FOUND");
    expect(deletePermanently).not.toHaveBeenCalled();
  });

  it("이름이 다르면 서버가 거부한다", async () => {
    findById.mockResolvedValue(target);

    await expect(
      deleteUserPermanently(admin, "u-9", "다른이름"),
    ).rejects.toThrow("NAME_MISMATCH");
    expect(deletePermanently).not.toHaveBeenCalled();
  });

  it("학생 계정이 아니면 삭제하지 못한다", async () => {
    findById.mockResolvedValue({ ...target, role: "PARENT" });

    await expect(
      deleteUserPermanently(admin, "u-9", "삭제대상"),
    ).rejects.toThrow("DELETE_STUDENT_ONLY");
    expect(deletePermanently).not.toHaveBeenCalled();
  });

  it("계정에 이름까지 맞으면 완전 삭제한다", async () => {
    findById.mockResolvedValue(target);

    await deleteUserPermanently(admin, "u-9", "삭제대상");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(deletePermanently).toHaveBeenCalledWith("u-9", "삭제대상", tx);
  });

  it("삭제 직전에 이름이 바뀌면 삭제하지 않고 NAME_MISMATCH로 반려한다", async () => {
    findById.mockResolvedValue(target);
    deletePermanently.mockResolvedValue(false);

    await expect(
      deleteUserPermanently(admin, "u-9", "삭제대상"),
    ).rejects.toThrow("NAME_MISMATCH");
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("감사로그를 남기되 이름은 넣지 않는다", async () => {
    findById.mockResolvedValue(target);

    await deleteUserPermanently(admin, "u-9", "삭제대상");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user:delete",
        targetType: "User",
        targetId: "u-9",
      }),
      tx,
    );
    expect(JSON.stringify(recordAudit.mock.calls[0]![0])).not.toContain("삭제대상");
  });
});
