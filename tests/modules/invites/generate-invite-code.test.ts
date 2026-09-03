import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateInviteCode } = await import("@/modules/invites/generate-invite-code");
const { formatInviteCode, normalizeInviteCode } = await import("@/modules/invites/invite-code");
const { formatInviteCodeInput } = await import("@/lib/masks");

describe("generateInviteCode()", () => {
  it("GBSW + 8자이고 혼동하기 쉬운 문자를 쓰지 않는다", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(12);
      expect(code).toMatch(/^GBSW[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("연달아 뽑아도 겹치지 않는다", () => {
    const codes = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(codes.size).toBe(500);
  });

  it("발급한 코드가 표시·입력 마스크를 거쳐도 그대로 돌아온다", () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateInviteCode();
      const typed = formatInviteCodeInput(formatInviteCode(code));
      expect(normalizeInviteCode(typed)).toBe(code);
    }
  });
});
