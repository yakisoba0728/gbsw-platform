import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 비밀번호 변경 액션의 **경계**.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 change-password-form.tsx가 실제로 보내는 name 그대로 만든다 —
 * `currentPassword` · `newPassword` · `confirmPassword` 셋.
 *
 * 이 액션만 `requireAuth({ allowMustChangePassword: true })`로 시작한다.
 * 강제 변경 대기 상태를 푸는 **유일한 경로**라서, 옵션이 빠지면 (app)/layout의
 * 가로채기가 자기 자신을 다시 튕겨내 리다이렉트 루프가 된다 — 화면에서만
 * 드러나는 종류의 실패라 여기서 못 박는다.
 */

const requireAuth = vi.fn(async () => ({ id: "u-1", role: "STUDENT" }));
const changeOwnPassword = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/account/account.service", () => ({ changeOwnPassword }));

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
    const state = await changePasswordAction(INITIAL, form());

    expect(changeOwnPassword).toHaveBeenCalledOnce();
    expect(state).toEqual({ ok: true, error: null });
  });

  it("폼의 세 필드를 모두 읽는다 — 하나라도 빠지면 스키마가 막는다", async () => {
    await changePasswordAction(INITIAL, form());

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

  it("강제 변경 대기 상태에서도 통과시킨다 — 그 상태를 푸는 유일한 경로다", async () => {
    await changePasswordAction(INITIAL, form());

    expect(requireAuth).toHaveBeenCalledWith({ allowMustChangePassword: true });
  });

  it("새 비밀번호가 짧으면 서비스를 부르지 않고 한국어로 알린다", async () => {
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
    expect(state.error).toBe("현재 비밀번호와 다른 비밀번호를 사용해 주세요.");
  });

  it("현재 비밀번호가 비면 서비스를 부르지 않는다", async () => {
    const state = await changePasswordAction(INITIAL, form({ currentPassword: "" }));

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("현재 비밀번호를 입력해 주세요.");
  });

  /*
   * C-1의 지문(fingerprint). 액션이 필드를 안 읽으면 formData.get이 null을 주고
   * zod가 이 영문 문구를 뱉는다 — 최초 관리자 생성이 100% 실패하던 그 화면에
   * 실제로 떠 있던 문장이 이것이다. 위의 "폼 그대로면 서비스까지 도달한다"가
   * 지켜지는 한 사용자는 이 문장을 볼 수 없다.
   */
  it("필드를 안 읽으면 C-1과 같은 영문 지문이 화면에 나간다", async () => {
    const state = await changePasswordAction(INITIAL, new FormData());

    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(state.error).toBe("Invalid input: expected string, received null");
  });

  it("서비스가 던지면 현재 비밀번호 불일치로 안내한다", async () => {
    changeOwnPassword.mockRejectedValueOnce(new Error("INVALID_PASSWORD"));

    const state = await changePasswordAction(INITIAL, form());

    expect(state).toEqual({ ok: false, error: "현재 비밀번호가 올바르지 않습니다." });
  });

  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await changePasswordAction(INITIAL, form({ currentPassword: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
