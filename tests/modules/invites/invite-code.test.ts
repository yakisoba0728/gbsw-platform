import { describe, expect, it } from "vitest";
import {
  formatInviteCode,
  isInviteUsable,
  maskInviteCode,
  normalizeInviteCode,
} from "@/modules/invites/invite-code";

describe("formatInviteCode()", () => {
  it("시안의 GBSW-0000-0000 형태로 끊는다", () => {
    expect(formatInviteCode("GBSWA3K92M7P")).toBe("GBSW-A3K9-2M7P");
  });

  it("정규화하면 원래대로 돌아온다", () => {
    const code = "GBSWA3K92M7P";
    expect(normalizeInviteCode(formatInviteCode(code))).toBe(code);
  });
});

describe("maskInviteCode()", () => {
  it("앞 네 자리를 가리고 식별에 필요한 끝 네 자리만 남긴다", () => {
    expect(maskInviteCode("GBSWA3K92M7P")).toBe("GBSW-••••-2M7P");
    expect(maskInviteCode("GBSW-A3K9-2M7P")).toBe("GBSW-••••-2M7P");
  });
});

describe("normalizeInviteCode()", () => {
  it("대소문자·공백·하이픈을 흘려보낸다", () => {
    expect(normalizeInviteCode(" gbsw-a3k9 2m7p ")).toBe("GBSWA3K92M7P");
    expect(normalizeInviteCode("GBSWA3K92M7P")).toBe("GBSWA3K92M7P");
  });

  it("앞의 GBSW를 빼먹어도 채워준다", () => {
    expect(normalizeInviteCode("A3K9-2M7P")).toBe("GBSWA3K92M7P");
  });
});

describe("isInviteUsable()", () => {
  const now = new Date("2026-08-12T00:00:00Z");

  it("PENDING이고 기한이 남아 있으면 쓸 수 있다", () => {
    expect(isInviteUsable({ status: "PENDING", expiresAt: null }, now)).toBe(true);
    expect(
      isInviteUsable(
        { status: "PENDING", expiresAt: new Date("2026-08-13T00:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("이미 쓰였거나 폐기됐으면 못 쓴다", () => {
    expect(isInviteUsable({ status: "USED", expiresAt: null }, now)).toBe(false);
    expect(isInviteUsable({ status: "REVOKED", expiresAt: null }, now)).toBe(false);
  });

  it("기한이 지났으면 못 쓴다", () => {
    expect(
      isInviteUsable(
        { status: "PENDING", expiresAt: new Date("2026-08-11T23:59:59Z") },
        now,
      ),
    ).toBe(false);
  });

  it("기한이 정확히 현재 시각이면 못 쓴다", () => {
    expect(isInviteUsable({ status: "PENDING", expiresAt: now }, now)).toBe(false);
  });
});
