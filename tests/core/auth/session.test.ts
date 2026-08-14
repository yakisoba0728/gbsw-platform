import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/core/auth/auth", () => ({ auth: { api: { getSession } } }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

/**
 * 실제 redirect()는 던져서 그 자리의 실행을 끊는다(Next 내부 특수 오류).
 * 여기서도 던지게 흉내 내어, requireAuth가 redirect 뒤에 이어지는 코드를
 * 실행하지 않는지까지 같이 검증한다.
 */
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect }));

const { requireAuth } = await import("@/core/auth/session");

function sessionUser(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "u1",
      name: "테스트",
      email: "t@gbsw.hs.kr",
      role: "ADMIN",
      status: "ACTIVE",
      deletedAt: null,
      mustChangePassword: false,
      ...overrides,
    },
  };
}

beforeEach(() => {
  getSession.mockReset();
  redirect.mockClear();
});

describe("requireAuth()", () => {
  it("세션이 없으면 /login으로 보낸다", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
  });

  it("비활성 계정은 /login?disabled=1로 보낸다", async () => {
    getSession.mockResolvedValue(sessionUser({ status: "INACTIVE" }));
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login?disabled=1");
  });

  it("명단에서 빠져 소프트 삭제된 계정은 status가 ACTIVE로 남아 있어도 " +
    "/login?disabled=1로 보낸다 — 세션 생성 훅을 빠져나온 옛 쿠키가 남아 있는 " +
    "경우까지 매 요청 다시 막는다 (defense-in-depth)", async () => {
    getSession.mockResolvedValue(
      sessionUser({ status: "ACTIVE", deletedAt: new Date() }),
    );
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login?disabled=1");
  });

  it("정상 계정은 그대로 통과한다", async () => {
    getSession.mockResolvedValue(sessionUser());
    const user = await requireAuth();
    expect(user.id).toBe("u1");
    expect(user.deletedAt).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  describe("mustChangePassword (M12)", () => {
    it("강제 변경 대기 중이면 /change-password로 보낸다 — 서버 액션에서도 걸린다", async () => {
      getSession.mockResolvedValue(sessionUser({ mustChangePassword: true }));
      await expect(requireAuth()).rejects.toThrow("REDIRECT:/change-password");
    });

    it("allowMustChangePassword:true면 통과시킨다 — /change-password 자신만 쓴다", async () => {
      getSession.mockResolvedValue(sessionUser({ mustChangePassword: true }));

      const user = await requireAuth({ allowMustChangePassword: true });

      expect(user.mustChangePassword).toBe(true);
      expect(redirect).not.toHaveBeenCalled();
    });

    it("mustChangePassword가 아니면 allowMustChangePassword 여부와 무관하게 통과한다", async () => {
      getSession.mockResolvedValue(sessionUser({ mustChangePassword: false }));

      const user = await requireAuth({ allowMustChangePassword: true });

      expect(user.mustChangePassword).toBe(false);
    });

    it("비활성 계정이면 강제 변경 여부와 무관하게 로그인 화면으로 먼저 보낸다", async () => {
      getSession.mockResolvedValue(
        sessionUser({ status: "INACTIVE", mustChangePassword: true }),
      );

      await expect(
        requireAuth({ allowMustChangePassword: true }),
      ).rejects.toThrow("REDIRECT:/login?disabled=1");
    });
  });
});
