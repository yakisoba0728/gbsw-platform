import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const changePassword = vi.fn();
const clearMustChangePassword = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/core/auth/auth", () => ({
  auth: { api: { changePassword } },
}));
vi.mock("@/modules/account/account.repo", () => ({ clearMustChangePassword }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { changeOwnPassword } = await import("@/modules/account/account.service");

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
    changePassword.mockReset().mockResolvedValue(undefined);
    clearMustChangePassword.mockReset();
    recordAudit.mockReset();
  });

  it("다른 기기 세션을 끊으면서 비밀번호를 바꾼다", async () => {
    const headers = new Headers();
    await changeOwnPassword(actor, input, headers);

    expect(changePassword).toHaveBeenCalledWith({
      body: {
        currentPassword: "old-password",
        newPassword: "new-password-1234",
        revokeOtherSessions: true,
      },
      headers,
    });
  });

  it("성공하면 mustChangePassword를 내리고 감사로그를 남긴다", async () => {
    await changeOwnPassword(actor, input, new Headers());

    expect(clearMustChangePassword).toHaveBeenCalledWith("u1");
    expect(recordAudit).toHaveBeenCalledWith({
      actorUserId: "u1",
      action: "account:change-password",
      targetType: "User",
      targetId: "u1",
    });
  });

  it("비밀번호 변경이 실패하면 플래그도 감사로그도 건드리지 않는다", async () => {
    changePassword.mockRejectedValue(new Error("INVALID_PASSWORD"));

    await expect(
      changeOwnPassword(actor, input, new Headers()),
    ).rejects.toThrow();

    expect(clearMustChangePassword).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
