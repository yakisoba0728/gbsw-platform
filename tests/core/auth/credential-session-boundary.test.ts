import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const verifyPassword = vi.fn();
const { bareWithTransaction: withTransaction } = coreMocks(
  "credential-session-boundary-test",
);

vi.mock("better-auth/crypto", () => ({ verifyPassword }));
vi.mock("@/core/db/client", () => ({
  prisma: {},
  withTransaction,
}));

const {
  assertCredentialSignInSessionStillCurrent,
  lockCredentialAccountForMutation,
} = await import("@/core/auth/credential-session-boundary");

describe("credential session boundary", () => {
  beforeEach(() => {
    verifyPassword.mockReset().mockResolvedValue(true);
    withTransaction.mockReset().mockImplementation(async (fn) => fn({
      $queryRaw: vi.fn().mockResolvedValue([
        { id: "credential-account", password: "current-hash" },
      ]),
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }));
  });

  it("credential sign-in 세션은 현재 account row lock 아래에서 현재 해시로 재검증한다", async () => {
    await assertCredentialSignInSessionStillCurrent(
      { id: "session-new", userId: "u1" },
      {
        path: "/sign-in/email",
        body: { email: "student@gbsw.hs.kr", password: "old-password" },
      },
    );

    expect(withTransaction).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith({
      hash: "current-hash",
      password: "old-password",
    });
  });

  it("현재 해시와 맞지 않으면 방금 만든 세션을 지우고 인증 실패로 돌린다", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const txEvents: string[] = [];
    verifyPassword.mockResolvedValue(false);
    withTransaction.mockImplementation(async (fn) => {
      const result = await fn({
        $queryRaw: vi.fn().mockResolvedValue([
          { id: "credential-account", password: "new-hash" },
        ]),
        session: {
          deleteMany: async (args: unknown) => {
            txEvents.push("delete");
            return deleteMany(args);
          },
        },
      });
      txEvents.push("committed");
      return result;
    });

    await expect(
      assertCredentialSignInSessionStillCurrent(
        { id: "session-new", userId: "u1" },
        {
          path: "/sign-in/email",
          body: { email: "student@gbsw.hs.kr", password: "old-password" },
        },
      ),
    ).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "session-new", userId: "u1" },
    });
    expect(txEvents).toEqual(["delete", "committed"]);
  });

  it("credential mutation도 같은 account row lock을 잡는다", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ id: "credential-account" }]) };

    await lockCredentialAccountForMutation("u1", db as never);

    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it.each([
    { path: "/verify-email", body: {} },
    { path: "/get-session", body: { email: "student@gbsw.hs.kr", password: "old-password" } },
  ])("$path 세션 생성은 credential 재검증을 하지 않는다", async (context) => {
    await assertCredentialSignInSessionStillCurrent(
      { id: "session-new", userId: "u1" },
      context,
    );

    expect(withTransaction).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });
});
