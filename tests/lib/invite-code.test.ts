import { describe, expect, it } from "vitest";
import {
  formatInviteCode,
  generateInviteCode,
  isInviteUsable,
  normalizeInviteCode,
} from "@/lib/invite-code";

describe("generateInviteCode()", () => {
  it("GBSW + 8자이고 혼동하기 쉬운 문자를 쓰지 않는다", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(12);
      // 0/O, 1/I/L 은 손으로 옮겨 적을 때 틀리기 쉬워 제외했다.
      expect(code).toMatch(/^GBSW[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("연달아 뽑아도 겹치지 않는다", () => {
    const codes = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(codes.size).toBe(500);
  });
});

describe("formatInviteCode()", () => {
  it("시안의 GBSW-0000-0000 형태로 끊는다", () => {
    expect(formatInviteCode("GBSWA3K92M7P")).toBe("GBSW-A3K9-2M7P");
  });

  it("방금 뽑은 코드를 정규화하면 원래대로 돌아온다", () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(formatInviteCode(code))).toBe(code);
  });
});

describe("normalizeInviteCode()", () => {
  it("대소문자·공백·하이픈을 흘려보낸다", () => {
    // 구두로 받아 적는 경우가 많아서 표기 흔들림을 허용한다.
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
