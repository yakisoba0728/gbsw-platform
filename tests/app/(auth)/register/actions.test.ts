import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 서버 액션의 **경계**를 검증한다 — FormData를 zod 스키마에 넘기는 그 지점.
 *
 * 이 층에 테스트가 없던 탓에 `bootstrapSchema`가 phone을 필수로 요구하게 된 뒤에도
 * 액션이 phone을 안 읽는 상태로 남았고, 최초 관리자 생성이 **항상** 실패했다.
 * 서비스 테스트는 입력 객체를 손으로 만들어 넘기므로 이 어긋남을 볼 수 없다.
 */

const createInitialAdmin = vi.fn();
const signInEmail = vi.fn();
const redirect = vi.fn(() => {
  // 실제 next/navigation의 redirect는 예외를 던져 이후 코드를 끊는다.
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/core/auth/auth", () => ({ auth: { api: { signInEmail } } }));
vi.mock("@/modules/bootstrap/bootstrap.service", () => ({ createInitialAdmin }));

// 이 액션 파일은 가입·인증 액션도 함께 담고 있다. 그쪽 서비스는 Prisma까지
// 끌고 오므로 목으로 끊는다 — 부트스트랩 경로와는 무관하다.
vi.mock("@/modules/registration/registration.service", () => ({
  RegistrationError: class extends Error {},
  checkInvite: vi.fn(),
  completeRegistration: vi.fn(),
  requestVerification: vi.fn(),
}));
vi.mock("@/modules/verification/verification.service", () => ({
  VerificationError: class extends Error {},
  confirmCode: vi.fn(),
}));

const { createInitialAdminAction } = await import(
  "@/app/(auth)/register/actions"
);

/** 부트스트랩 폼(bootstrap-form.tsx)이 실제로 보내는 필드 그대로. */
function bootstrapForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    token: "bootstrap-token",
    name: "홍길동",
    email: "admin@gbsw.hs.kr",
    phone: "010-1234-5678",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createInitialAdminAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    await expect(
      createInitialAdminAction({ error: null }, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createInitialAdmin).toHaveBeenCalledOnce();
  });

  it("폼의 phone을 읽는다 — 안 읽으면 스키마가 막아 서비스에 못 간다", async () => {
    await expect(
      createInitialAdminAction({ error: null }, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createInitialAdmin).toHaveBeenCalledWith(
      "bootstrap-token",
      expect.objectContaining({ phone: "010-1234-5678" }),
    );
  });

  it("검증 실패 문구는 한글이다 — 이 화면은 zod 기본 메시지가 그대로 나가는 자리다", async () => {
    const state = await createInitialAdminAction(
      { error: null },
      bootstrapForm({ phone: "01012" }),
    );

    expect(createInitialAdmin).not.toHaveBeenCalled();
    expect(state.error).toBe("휴대폰 번호 형식이 올바르지 않습니다.");
  });

  it("검증에 걸리면 토큰을 쓰지 않는다 — 오타로 링크가 날아가면 안 된다", async () => {
    await createInitialAdminAction({ error: null }, bootstrapForm({ name: "" }));

    expect(createInitialAdmin).not.toHaveBeenCalled();
  });

  it("서비스가 던지면 실패 원인을 구분해 알리지 않는다", async () => {
    createInitialAdmin.mockRejectedValueOnce(new Error("ALREADY_SET"));

    const state = await createInitialAdminAction(
      { error: null },
      bootstrapForm(),
    );

    expect(state.error).toContain("관리자 계정을 만들 수 없습니다");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("성공하면 바로 로그인시킨다 — 만든 사람이 다시 입력하게 두지 않는다", async () => {
    await expect(
      createInitialAdminAction({ error: null }, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          email: "admin@gbsw.hs.kr",
          password: "correct-horse-battery",
        },
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("로그인이 실패해도 계정 생성은 성공으로 끝낸다", async () => {
    signInEmail.mockRejectedValueOnce(new Error("세션 발급 실패"));

    await expect(
      createInitialAdminAction({ error: null }, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/");
  });
});
