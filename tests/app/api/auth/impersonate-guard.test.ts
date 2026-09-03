import { describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response("leaked"));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: handler,
    POST: handler,
  })),
}));
vi.mock("@/core/auth/auth", () => ({ auth: {} }));
vi.mock("@/modules/auth/auth.service", () => ({ signOut: vi.fn() }));

const { GET, POST } = await import("@/app/api/auth/[...all]/route");
const { adminRoles } = await import("@/core/auth/permissions");

function context(all: string[]) {
  return { params: Promise.resolve({ all }) };
}

describe("impersonate는 이중으로 막혀 있다", () => {
  it("allowlist가 admin/impersonate를 404로 막는다", async () => {
    const request = new Request("https://example.test/api/auth/admin/impersonate");

    const post = await POST(request as never, context(["admin", "impersonate"]));
    const get = await GET(request as never, context(["admin", "impersonate"]));

    expect(post.status).toBe(404);
    expect(get.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allowlist가 누락돼도 ADMIN 역할 자체에 admin 플러그인 권한이 없다", () => {
    // route.ts의 allowlist(get-session·sign-out만 통과)가 유일한 방어선이 되지
    // 않도록, ADMIN 역할도 impersonate·ban·set-role 같은 동작을 승인하지 않는다.
    const dangerous = [
      ["user", "impersonate"],
      ["user", "set-role"],
      ["user", "ban"],
      ["user", "list"],
      ["user", "set-password"],
      ["user", "delete"],
      ["session", "list"],
      ["session", "revoke"],
    ] as const;

    for (const [resource, action] of dangerous) {
      expect(
        adminRoles.ADMIN.authorize({ [resource]: [action] } as never).success,
      ).toBe(false);
    }
  });
});
