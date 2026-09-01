import { beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => new Response("passed"));
const signOut = vi.fn();

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: handler,
    POST: handler,
  })),
}));
vi.mock("@/core/auth/auth", () => ({ auth: {} }));
vi.mock("@/modules/auth/auth.service", () => ({ signOut }));

const { GET, POST, isAllowedAuthEndpoint } = await import(
  "@/app/api/auth/[...all]/route"
);

function context(all: string[]) {
  return { params: Promise.resolve({ all }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue(new Response("passed"));
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

  it("delegates sign-out to the auth service without replacing its response", async () => {
    const request = new Request("https://example.test/api/auth/sign-out");
    const expected = new Response("signed out", {
      headers: { "set-cookie": "session=; Max-Age=0" },
    });
    signOut.mockResolvedValueOnce(expected);

    const response = await POST(request as never, context(["sign-out"]));

    expect(response).toBe(expected);
    expect(signOut).toHaveBeenCalledWith(request);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not inspect or record the actor for the session read endpoint", async () => {
    const response = await GET(
      new Request("https://example.test/api/auth/get-session") as never,
      context(["get-session"]),
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.any(Request));
    expect(signOut).not.toHaveBeenCalled();
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
