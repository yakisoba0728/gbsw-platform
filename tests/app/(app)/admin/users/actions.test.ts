import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";

const requireAuth = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const unstable_rethrow = vi.fn((error: unknown) => {
  if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
});

const updateUser = vi.fn();
const setUserActive = vi.fn();
const resetPassword = vi.fn();
const deleteUserPermanently = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/admin-users/admin-user.service", () => ({
  AdminUserError: class AdminUserError extends Error {},
  updateUser,
  setUserActive,
  resetPassword,
  deleteUserPermanently,
}));

const { AdminUserError } = await import(
  "@/modules/admin-users/admin-user.service"
);
const {
  updateUserAction,
  setUserActiveAction,
  resetPasswordAction,
  deleteUserPermanentlyAction,
} = await import("@/app/(app)/admin/users/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function studentForm(over: Record<string, string> = {}): FormData {
  return form({
    userId: "u-1",
    updatedAt: "2026-08-19T00:00:00.000Z",
    name: "홍길동",
    email: "hong@gbsw.hs.kr",
    phone: "010-1234-5678",
    birthDate: "2010-03-02",
    grade: "1",
    classNo: "2",
    number: "13",
    ...over,
  });
}

function adminForm(over: Record<string, string> = {}): FormData {
  return form({
    userId: "u-2",
    updatedAt: "2026-08-19T00:00:00.000Z",
    name: "김교사",
    email: "kim@gbsw.hs.kr",
    phone: "010-2222-3333",
    ...over,
  });
}

const USER_INITIAL = { ok: false, error: null, tempPassword: null };
const UPDATE_INITIAL = { error: null, changed: null, values: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  updateUser.mockResolvedValue({ changed: ["name"] });
  resetPassword.mockResolvedValue({ tempPassword: "temp-1234-abcd" });
});

describe("updateUserAction — 경계 검증", () => {
  it("재학생 폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(updateUser).toHaveBeenCalledWith(expect.anything(), "u-1", {
      name: "홍길동",
      email: "hong@gbsw.hs.kr",
      phone: "010-1234-5678",
      updatedAt: new Date("2026-08-19T00:00:00.000Z"),
      birthDate: "2010-03-02",
      grade: 1,
      classNo: 2,
      number: 13,
    }, undefined);
    expect(state).toEqual({ error: null, changed: ["name"], values: null });
  });

  it("비학생 폼은 학적 칸을 아예 안 보낸다 — 그래도 통과해야 한다", async () => {
    const state = await updateUserAction(UPDATE_INITIAL, adminForm());

    expect(updateUser).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
    const input = updateUser.mock.calls[0]?.[2];
    expect(input.birthDate).toBe("");
    expect(input.grade).toBeUndefined();
    expect(input.classNo).toBeUndefined();
    expect(input.number).toBeUndefined();
  });

  it("재학 중이 아닌 학생은 학년·반·번호 칸이 없다 — 생년월일만 온다", async () => {
    const fd = studentForm();
    for (const key of ["grade", "classNo", "number"]) fd.delete(key);

    const state = await updateUserAction(UPDATE_INITIAL, fd);

    expect(updateUser).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
    expect(updateUser.mock.calls[0]?.[2].birthDate).toBe("2010-03-02");
  });

  it("이메일 형식이 틀리면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await updateUserAction(
      UPDATE_INITIAL,
      studentForm({ email: "hong(at)gbsw" }),
    );

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("이메일 형식이 올바르지 않습니다.");
  });

  it("휴대폰 형식이 틀리면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await updateUserAction(
      UPDATE_INITIAL,
      studentForm({ phone: "01012" }),
    );

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("휴대폰 번호 형식이 올바르지 않습니다.");
  });

  it("이름이 비면 서비스를 부르지 않는다", async () => {
    const state = await updateUserAction(UPDATE_INITIAL, studentForm({ name: " " }));

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("이름을 입력해 주세요.");
  });

  it("생년월일 형식이 틀리면 서비스를 부르지 않는다", async () => {
    const state = await updateUserAction(
      UPDATE_INITIAL,
      studentForm({ birthDate: "2010/03/02" }),
    );

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("생년월일 형식이 올바르지 않습니다.");
  });

  it("역할은 스키마에 없다 — 보내도 서비스로 새지 않는다", async () => {
    await updateUserAction(UPDATE_INITIAL, studentForm({ role: "ADMIN" }));

    expect(updateUser.mock.calls[0]?.[2]).not.toHaveProperty("role");
  });

  it("바뀐 게 없으면 빈 배열을 그대로 화면에 넘긴다", async () => {
    updateUser.mockResolvedValueOnce({ changed: [] });

    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.changed).toEqual([]);
  });

  it("권한 거부를 '저장하지 못했습니다'로 덮지 않는다", async () => {
    updateUser.mockRejectedValueOnce(new ForbiddenError("user:update"));

    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("번호 충돌은 그 이유를 알린다", async () => {
    updateUser.mockRejectedValueOnce(new AdminUserError("NUMBER_TAKEN"));

    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.error).toBe("같은 반에 같은 번호가 있습니다.");
  });

  it("다른 곳에서 먼저 저장된 폼이면 충돌을 알린다", async () => {
    updateUser.mockRejectedValueOnce(new AdminUserError("USER_CHANGED"));

    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.error).toBe("계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    updateUser.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.error).toBe("저장하지 못했습니다.");
  });

  it("userId가 없으면 서비스를 부르지 않는다", async () => {
    const fd = studentForm();
    fd.delete("userId");

    const state = await updateUserAction(UPDATE_INITIAL, fd);

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("계정을 찾을 수 없습니다.");
  });

  it("userId가 공백뿐이어도 막는다 — trim 후에 본다", async () => {
    const state = await updateUserAction(UPDATE_INITIAL, studentForm({ userId: "   " }));

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("계정을 찾을 수 없습니다.");
  });

  it("updatedAt이 없으면 서비스를 부르지 않는다", async () => {
    const fd = studentForm();
    fd.delete("updatedAt");

    const state = await updateUserAction(UPDATE_INITIAL, fd);

    expect(updateUser).not.toHaveBeenCalled();
    expect(state.error).toBe("계정 정보가 다른 곳에서 바뀌었습니다. 새로고침 후 다시 저장해 주세요.");
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    const fd = studentForm();
    fd.delete("userId");

    await updateUserAction(UPDATE_INITIAL, fd);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("검증에 걸려도 제출값을 그대로 돌려준다 — 틀린 값도 함께", async () => {
    const state = await updateUserAction(
      UPDATE_INITIAL,
      studentForm({ email: "hong(at)gbsw", name: "홍길자" }),
    );

    expect(state.values).toEqual({
      name: "홍길자",
      email: "hong(at)gbsw",
      phone: "010-1234-5678",
      birthDate: "2010-03-02",
      grade: "1",
      classNo: "2",
      number: "13",
    });
  });

  it("서비스가 거부해도 제출값을 돌려준다", async () => {
    updateUser.mockRejectedValueOnce(new AdminUserError("NUMBER_TAKEN"));

    const state = await updateUserAction(
      UPDATE_INITIAL,
      studentForm({ number: "13" }),
    );

    expect(state.values?.number).toBe("13");
    expect(state.values?.name).toBe("홍길동");
  });

  it("성공하면 제출값을 싣지 않는다 — 저장된 서버 값이 보여야 한다", async () => {
    const state = await updateUserAction(UPDATE_INITIAL, studentForm());

    expect(state.values).toBeNull();
  });

  it("비학생 폼이 안 보낸 칸은 빈 문자열로 돌려준다", async () => {
    updateUser.mockRejectedValueOnce(new AdminUserError("EMAIL_TAKEN"));

    const state = await updateUserAction(UPDATE_INITIAL, adminForm());

    expect(state.values).toEqual({
      name: "김교사",
      email: "kim@gbsw.hs.kr",
      phone: "010-2222-3333",
      birthDate: "",
      grade: "",
      classNo: "",
      number: "",
    });
  });
});

describe("setUserActiveAction — 경계 검증", () => {
  it("ToggleActiveForm이 보내는 두 hidden input을 읽는다", async () => {
    await setUserActiveAction(USER_INITIAL, form({ userId: "u-1", active: "false" }));

    expect(setUserActive).toHaveBeenCalledWith(expect.anything(), "u-1", false, undefined);
  });

  it("active=\"true\"만 활성화로 읽는다", async () => {
    await setUserActiveAction(USER_INITIAL, form({ userId: "u-1", active: "true" }));

    expect(setUserActive).toHaveBeenCalledWith(expect.anything(), "u-1", true, undefined);
  });

  it("성공하면 목록과 상세를 함께 다시 그린다", async () => {
    await setUserActiveAction(USER_INITIAL, form({ userId: "u-1", active: "true" }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/u-1");
  });

  it("권한 거부를 '상태를 바꾸지 못했습니다'로 덮지 않는다", async () => {
    setUserActive.mockRejectedValueOnce(new ForbiddenError("user:set-active"));

    const state = await setUserActiveAction(
      USER_INITIAL,
      form({ userId: "u-1", active: "false" }),
    );

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("자기 계정 비활성화는 그 이유를 알린다", async () => {
    setUserActive.mockRejectedValueOnce(
      new AdminUserError("CANNOT_DEACTIVATE_SELF"),
    );

    const state = await setUserActiveAction(
      USER_INITIAL,
      form({ userId: "u-1", active: "false" }),
    );

    expect(state.error).toBe("자기 계정은 비활성화할 수 없습니다.");
  });

  it("실패하면 화면을 다시 그리지 않는다", async () => {
    setUserActive.mockRejectedValueOnce(new AdminUserError("NOT_FOUND"));

    await setUserActiveAction(USER_INITIAL, form({ userId: "u-1", active: "false" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("userId가 없으면 서비스를 부르지 않는다", async () => {
    const state = await setUserActiveAction(USER_INITIAL, form({ active: "false" }));

    expect(setUserActive).not.toHaveBeenCalled();
    expect(state.error).toBe("계정을 찾을 수 없습니다.");
  });

  it("active가 아는 값이 아니면 비활성으로 읽지 않고 막는다", async () => {
    const state = await setUserActiveAction(
      USER_INITIAL,
      form({ userId: "u-1", active: "ture" }),
    );

    expect(setUserActive).not.toHaveBeenCalled();
    expect(state.error).toBe("계정 상태 값이 올바르지 않습니다.");
  });

  it("active 칸이 아예 없어도 막는다", async () => {
    const state = await setUserActiveAction(USER_INITIAL, form({ userId: "u-1" }));

    expect(setUserActive).not.toHaveBeenCalled();
    expect(state.error).toBe("계정 상태 값이 올바르지 않습니다.");
  });
});

describe("resetPasswordAction — 경계 검증", () => {
  it("ResetPasswordForm이 보내는 userId 하나면 서비스까지 도달한다", async () => {
    const state = await resetPasswordAction(USER_INITIAL, form({ userId: "u-1" }));

    expect(resetPassword).toHaveBeenCalledWith(expect.anything(), "u-1", undefined);
    expect(state.tempPassword).toBe("temp-1234-abcd");
  });

  it("사유를 적으면 서비스까지 실려 간다", async () => {
    await resetPasswordAction(
      USER_INITIAL,
      form({ userId: "u-1", reason: "본인이 분실 신고" }),
    );

    expect(resetPassword).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      "본인이 분실 신고",
    );
  });

  it("실패하면 임시 비밀번호를 남기지 않는다", async () => {
    resetPassword.mockRejectedValueOnce(
      new AdminUserError("NO_CREDENTIAL_ACCOUNT"),
    );

    const state = await resetPasswordAction(USER_INITIAL, form({ userId: "u-1" }));

    expect(state.tempPassword).toBeNull();
    expect(state.error).toBe("비밀번호 로그인을 쓰지 않는 계정입니다.");
  });

  it("권한 거부를 '비밀번호를 초기화하지 못했습니다'로 덮지 않는다", async () => {
    resetPassword.mockRejectedValueOnce(new ForbiddenError("user:reset-password"));

    const state = await resetPasswordAction(USER_INITIAL, form({ userId: "u-1" }));

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("userId가 없으면 서비스를 부르지 않는다", async () => {
    const state = await resetPasswordAction(USER_INITIAL, form({}));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("계정을 찾을 수 없습니다.");
    expect(state.tempPassword).toBeNull();
  });
});

describe("deleteUserPermanentlyAction — 경계 검증", () => {
  it("HardDeleteForm이 보내는 두 필드를 읽는다", async () => {
    await expect(
      deleteUserPermanentlyAction(
        USER_INITIAL,
        form({ userId: "u-1", confirmName: "홍길동" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteUserPermanently).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      "홍길동",
    );
  });

  it("성공하면 목록으로 돌려보낸다 — 이 상세 페이지는 이제 없다", async () => {
    await expect(
      deleteUserPermanentlyAction(
        USER_INITIAL,
        form({ userId: "u-1", confirmName: "홍길동" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/admin/users");
  });

  it("redirect의 오류를 '삭제하지 못했습니다'로 삼키지 않는다", async () => {
    await expect(
      deleteUserPermanentlyAction(
        USER_INITIAL,
        form({ userId: "u-1", confirmName: "홍길동" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  it("이름이 다르면 서비스가 막고 그 이유를 알린다", async () => {
    deleteUserPermanently.mockRejectedValueOnce(
      new AdminUserError("NAME_MISMATCH"),
    );

    const state = await deleteUserPermanentlyAction(
      USER_INITIAL,
      form({ userId: "u-1", confirmName: "홍길자" }),
    );

    expect(state.error).toBe("이름이 일치하지 않습니다.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("학생 계정이 아니면 삭제하지 못한다고 알린다", async () => {
    deleteUserPermanently.mockRejectedValueOnce(
      new AdminUserError("DELETE_STUDENT_ONLY"),
    );

    const state = await deleteUserPermanentlyAction(
      USER_INITIAL,
      form({ userId: "u-1", confirmName: "홍길동" }),
    );

    expect(state.error).toBe("학생 계정만 삭제할 수 있습니다.");
  });

  it("권한 거부를 '완전히 삭제하지 못했습니다'로 덮지 않는다", async () => {
    deleteUserPermanently.mockRejectedValueOnce(new ForbiddenError("user:delete"));

    const state = await deleteUserPermanentlyAction(
      USER_INITIAL,
      form({ userId: "u-1", confirmName: "홍길동" }),
    );

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("확인 이름이 비면 서비스도 부르지 않고 목록으로 보내지도 않는다", async () => {
    const state = await deleteUserPermanentlyAction(
      USER_INITIAL,
      form({ userId: "u-1", confirmName: "  " }),
    );

    expect(deleteUserPermanently).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(state.error).toBe("확인을 위해 이름을 입력해 주세요.");
  });

  it("userId가 없으면 서비스를 부르지 않는다", async () => {
    const state = await deleteUserPermanentlyAction(
      USER_INITIAL,
      form({ confirmName: "홍길동" }),
    );

    expect(deleteUserPermanently).not.toHaveBeenCalled();
    expect(state.error).toBe("계정을 찾을 수 없습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await updateUserAction(UPDATE_INITIAL, studentForm({ name: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
