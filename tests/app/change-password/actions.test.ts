import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.fn(async () => ({ id: "u-1", role: "STUDENT" }));
const changeOwnPassword = vi.fn();
class InvalidCurrentPasswordError extends Error {}
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const unstable_rethrow = vi.fn((error: unknown) => {
  if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/account/account.service", () => ({
  changeOwnPassword,
  InvalidCurrentPasswordError,
}));

const { changePasswordAction } = await import("@/app/change-password/actions");

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    currentPassword: "old-password-1234",
    newPassword: "new-password-5678",
    confirmPassword: "new-password-5678",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const INITIAL = { error: null, ok: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("changePasswordAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    await expect(changePasswordAction(INITIAL, form())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(changeOwnPassword).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/login?passwordChanged=1");
  });

  it("폼의 세 필드를 모두 읽는다 — 하나라도 빠지면 스키마가 막는다", async () => {
    await expect(changePasswordAction(INITIAL, form())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(changeOwnPassword).toHaveBeenCalledWith(
      expect.anything(),
      {
        currentPassword: "old-password-1234",
        newPassword: "new-password-5678",
        confirmPassword: "new-password-5678",
      },
      expect.any(Headers),
    );
  });

  it("강제 변경 대기 상태에서도 통과시킨다", async () => {
    await expect(changePasswordAction(INITIAL, form())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(requireAuth).toHaveBeenCalledWith({ allowMustChangePassword: true });
  });

  it("새 비밀번호가 짧으면 서비스를 부르지 않는다", async () => {
    const state = await changePasswordAction(
      INITIAL,
      form({ newPassword: "짧다", confirmPassword: "짧다" }),
    );

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("새 비밀번호는 10자 이상이어야 합니다.");
  });

  it("확인이 다르면 서비스를 부르지 않는다", async () => {
    const state = await changePasswordAction(
      INITIAL,
      form({ confirmPassword: "different-password" }),
    );

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("새 비밀번호가 서로 다릅니다.");
  });

  it("현재 비밀번호를 그대로 다시 쓰면 막는다", async () => {
    const state = await changePasswordAction(
      INITIAL,
      form({
        newPassword: "old-password-1234",
        confirmPassword: "old-password-1234",
      }),
    );

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("지금과 다른 비밀번호를 정해 주세요.");
  });

  it("현재 비밀번호가 비면 서비스를 부르지 않는다", async () => {
    const state = await changePasswordAction(INITIAL, form({ currentPassword: "" }));

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("현재 비밀번호를 입력해 주세요.");
  });

  it("필드를 안 읽으면 영문 지문 대신 한국어로 안내한다", async () => {
    const state = await changePasswordAction(INITIAL, new FormData());

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("입력을 확인해 주세요.");
  });

  it("현재 비밀번호 불일치만 해당 문구로 안내한다", async () => {
    changeOwnPassword.mockRejectedValueOnce(new InvalidCurrentPasswordError());

    const state = await changePasswordAction(INITIAL, form());

    expect(state).toEqual({ ok: false, error: "현재 비밀번호가 맞지 않습니다." });
  });

  it("예기치 못한 실패는 안전하게 로그를 남기고 일반 실패로 안내한다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    changeOwnPassword.mockRejectedValueOnce(new Error("audit failed"));

    const state = await changePasswordAction(INITIAL, form());

    expect(state).toEqual({
      ok: false,
      error: "비밀번호를 변경하지 못했습니다.",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[account] 예상 못 한 오류",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await changePasswordAction(INITIAL, form({ currentPassword: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
