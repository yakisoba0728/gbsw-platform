import { describe, expect, it, vi } from "vitest";
import {
  findOwnCredentialAccountRevision,
  updateOwnPassword,
} from "@/modules/account/account.repo";

describe("updateOwnPassword()", () => {
  it("credential revision을 읽는다", async () => {
    const updatedAt = new Date("2026-08-19T00:00:00.000Z");
    const db = {
      account: {
        findFirst: vi.fn().mockResolvedValue({ id: "credential-account", updatedAt }),
      },
    };

    await expect(
      findOwnCredentialAccountRevision("u1", db as never),
    ).resolves.toEqual({ id: "credential-account", updatedAt });

    expect(db.account.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", providerId: "credential" },
      select: { id: true, updatedAt: true },
    });
  });

  it("changes the captured credential hash, clears mustChangePassword, and revokes every session", async () => {
    const updatedAt = new Date("2026-08-19T00:00:00.000Z");
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "credential-account" }]),
      account: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        deleteMany: vi.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    };

    await updateOwnPassword(
      {
        userId: "u1",
        credential: { id: "credential-account", updatedAt },
        currentSessionId: "session-current",
        passwordHash: "hashed-new-password",
      },
      db as never,
    );

    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: "credential-account",
        userId: "u1",
        providerId: "credential",
        updatedAt,
      },
      data: { password: "hashed-new-password" },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { mustChangePassword: false },
    });
    expect(db.session.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: "session-current", userId: "u1" },
    });
    expect(db.session.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { userId: "u1", id: { not: "session-current" } },
    });
  });

  it("fails before clearing sessions if the credential revision is stale", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "credential-account" }]),
      account: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: vi.fn(),
      },
      session: {
        deleteMany: vi.fn(),
      },
    };

    await expect(
      updateOwnPassword(
        {
          userId: "u1",
          credential: {
            id: "credential-account",
            updatedAt: new Date("2026-08-19T00:00:00.000Z"),
          },
          currentSessionId: "session-current",
          passwordHash: "hashed-new-password",
        },
        db as never,
      ),
    ).rejects.toThrow("CREDENTIAL_ACCOUNT_STALE");

    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });

  it("fails before revoking other sessions if the captured current session is stale", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "credential-account" }]),
      account: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        deleteMany: vi.fn().mockResolvedValueOnce({ count: 0 }),
      },
    };

    await expect(
      updateOwnPassword(
        {
          userId: "u1",
          credential: {
            id: "credential-account",
            updatedAt: new Date("2026-08-19T00:00:00.000Z"),
          },
          currentSessionId: "session-current",
          passwordHash: "hashed-new-password",
        },
        db as never,
      ),
    ).rejects.toThrow("SESSION_STALE");

    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.session.deleteMany).toHaveBeenCalledOnce();
  });
});
