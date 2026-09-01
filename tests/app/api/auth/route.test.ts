import { beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response("passed"));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: handler,
    POST: handler,
  })),
}));
vi.mock("@/core/auth/auth", () => ({ auth: {} }));

const { GET, POST, isAllowedAuthEndpoint } = await import(
  "@/app/api/auth/[...all]/route"
);

function context(all: string[]) {
  return { params: Promise.resolve({ all }) };
}

beforeEach(() => {
  handler.mockClear();
});

describe("/api/auth/[...all] route policy", () => {
  it("preserves the app's Better Auth session/logout endpoints", async () => {
    await expect(
      isAllowedAuthEndpoint("GET", context(["get-session"])),
    ).resolves.toBe(true);
    await expect(
      isAllowedAuthEndpoint("POST", context(["sign-out"])),
    ).resolves.toBe(true);
  });

  it("passes allowed endpoints through to Better Auth", async () => {
    const response = await POST(
      new Request("https://example.test/api/auth/sign-out") as never,
      context(["sign-out"]),
    );

    expect(await response.text()).toBe("passed");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("blocks raw email login so sessions only start through the audited login route", async () => {
    const response = await POST(
      new Request("https://example.test/api/auth/sign-in/email") as never,
      context(["sign-in", "email"]),
    );

    expect(response.status).toBe(404);
    await expect(
      isAllowedAuthEndpoint("POST", context(["sign-in", "email"])),
    ).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("blocks raw user mutation endpoints that bypass app services", async () => {
    for (const path of [
      ["update-user"],
      ["change-password"],
      ["delete-user"],
      ["revoke-sessions"],
      ["revoke-session"],
      ["revoke-other-sessions"],
    ]) {
      const response = await POST(
        new Request(`https://example.test/api/auth/${path.join("/")}`) as never,
        context(path),
      );

      expect(response.status).toBe(404);
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("blocks every Better Auth admin route, including decoded path attempts", async () => {
    for (const path of [
      ["admin", "update-user"],
      ["admin", "set-user-password"],
      ["admin", "remove-user"],
    ]) {
      const response = await POST(
        new Request(`https://example.test/api/auth/${path.join("/")}`) as never,
        context(path),
      );

      expect(response.status).toBe(404);
    }

    await expect(
      isAllowedAuthEndpoint("POST", context(["admin", "update-user"])),
    ).resolves.toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("blocks the nonexistent POST get-session endpoint", async () => {
    const response = await POST(
      new Request("https://example.test/api/auth/get-session") as never,
      context(["get-session"]),
    );

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not expose unknown Better Auth routes by default", async () => {
    const response = await GET(
      new Request("https://example.test/api/auth/list-sessions") as never,
      context(["list-sessions"]),
    );

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });
});
