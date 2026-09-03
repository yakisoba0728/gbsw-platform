import { beforeEach, describe, expect, it, vi } from "vitest";

const actor = { id: "student-user", role: "STUDENT" };
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const unstable_rethrow = vi.fn((error: unknown) => {
  if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
});
const requestPass = vi.fn();
const revalidatePath = vi.fn();
const setCookie = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: setCookie })),
  headers: vi.fn(async () => new Headers({ origin: "http://student.localhost:3000" })),
}));
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow }));
vi.mock("@/core/auth/session", () => ({ requireAuth: vi.fn(async () => actor) }));
vi.mock("@/modules/pass/request.service", () => ({ requestPass }));
vi.mock("@/modules/pass/decision.service", () => ({}));

const { requestAction } = await import("@/app/(app)/pass/actions");

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-flash-0123456789";
  vi.clearAllMocks();
  requestPass.mockResolvedValue({ id: "pass-1" });
});

describe("requestAction", () => {
  it("저장 뒤 서버에서 목록의 일회성 성공 안내로 이동한다", async () => {
    const form = new FormData();
    form.set("type", "OUTING");
    form.set("date", "2099-09-01");
    form.set("startTime", "09:00");
    form.set("endTime", "10:00");
    form.set("destination", "치과");
    form.set("reason", "정기 검진");

    await expect(
      requestAction({ error: null, ok: false }, form),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(requestPass).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ type: "OUTING", destination: "치과" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/pass");
    expect(setCookie).toHaveBeenCalledWith(
      "gbsw.pass-flash",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 120, path: "/pass" }),
    );
    expect(redirect).toHaveBeenCalledWith("/pass");
  });
});
