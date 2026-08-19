import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const getSession = vi.fn();
const verifyPassword = vi.fn();
const hashPassword = vi.fn();
const findOwnCredentialAccountRevision = vi.fn();
const updateOwnPassword = vi.fn();
const recordAudit = vi.fn();
const withTransaction = vi.fn();

vi.mock("@/core/auth/auth", () => ({
  auth: { api: { getSession, verifyPassword } },
}));
vi.mock("better-auth/crypto", () => ({ hashPassword }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/account/account.repo", () => ({
  findOwnCredentialAccountRevision,
  updateOwnPassword,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { changeOwnPassword, InvalidCurrentPasswordError } = await import(
  "@/modules/account/account.service"
);

const actor: SessionUser = {
  id: "u1",
  name: "홍길동",
  email: "hong@gbsw.hs.kr",
  role: "ADMIN",
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: true,
};

const input = {
  currentPassword: "old-password",
  newPassword: "new-password-1234",
  confirmPassword: "new-password-1234",
};

describe("changeOwnPassword()", () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({
      session: { id: "session-current" },
      user: { id: "u1" },
    });
    verifyPassword.mockReset().mockResolvedValue({ status: true });
    hashPassword.mockReset().mockResolvedValue("hashed-new-password");
    findOwnCredentialAccountRevision.mockReset().mockResolvedValue({
      id: "credential-account",
      updatedAt: new Date("2026-08-19T00:00:00.000Z"),
    });
    updateOwnPassword.mockReset();
    recordAudit.mockReset();
    withTransaction.mockReset().mockImplementation(async (fn) => fn({ tx: true }));
  });

  it("credential revision을 먼저 잡고 Better Auth에는 현재 세션과 현재 비밀번호 검증만 맡긴다", async () => {
    const headers = new Headers();
    await changeOwnPassword(actor, input, headers);

    expect(findOwnCredentialAccountRevision).toHaveBeenCalledWith("u1");
    expect(findOwnCredentialAccountRevision.mock.invocationCallOrder[0]).toBeLessThan(
      verifyPassword.mock.invocationCallOrder[0]!,
    );
    expect(getSession).toHaveBeenCalledWith({ headers });
    expect(verifyPassword).toHaveBeenCalledWith({
      body: { password: "old-password" },
      headers,
    });
  });

  it("새 해시를 트랜잭션 밖에서 만들고 같은 tx로 비밀번호·세션·감사를 처리한다", async () => {
    await changeOwnPassword(actor, input, new Headers());

    expect(hashPassword).toHaveBeenCalledWith("new-password-1234");
    expect(hashPassword.mock.invocationCallOrder[0]).toBeLessThan(
      withTransaction.mock.invocationCallOrder[0]!,
    );
    expect(updateOwnPassword).toHaveBeenCalledWith({
      userId: "u1",
      credential: {
        id: "credential-account",
        updatedAt: new Date("2026-08-19T00:00:00.000Z"),
      },
      currentSessionId: "session-current",
      passwordHash: "hashed-new-password",
    }, { tx: true });
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "u1",
      action: "account:change-password",
      targetType: "User",
      targetId: "u1",
    }, { tx: true });
  });

  it("현재 비밀번호 검증이 실패하면 분류된 오류로 돌려주고 저장소도 감사로그도 건드리지 않는다", async () => {
    verifyPassword.mockRejectedValue(new Error("INVALID_PASSWORD"));

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow(InvalidCurrentPasswordError);

    expect(updateOwnPassword).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("현재 Better Auth 세션이 행위자와 다르면 저장하지 않는다", async () => {
    getSession.mockResolvedValue({
      session: { id: "session-current" },
      user: { id: "other-user" },
    });

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow("SESSION_NOT_FOUND");

    expect(hashPassword).not.toHaveBeenCalled();
    expect(updateOwnPassword).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("credential account가 사라졌으면 현재 비밀번호 검증 전에 중단한다", async () => {
    findOwnCredentialAccountRevision.mockResolvedValue(null);

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow("CREDENTIAL_ACCOUNT_NOT_FOUND");

    expect(verifyPassword).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(updateOwnPassword).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("현재 비밀번호 검증의 예기치 못한 실패는 그대로 전파한다", async () => {
    verifyPassword.mockRejectedValue(new Error("database unavailable"));

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow("database unavailable");
  });

  it("감사 실패 시 트랜잭션 전체를 실패시킨다", async () => {
    recordAudit.mockRejectedValue(new Error("audit failed"));

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow("audit failed");

    expect(withTransaction).toHaveBeenCalledOnce();
  });
});
