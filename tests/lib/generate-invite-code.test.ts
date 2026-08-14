import { describe, expect, it, vi } from "vitest";

// "server-only"는 웹팩의 react-server 조건에서만 무해한 empty.js로 풀리고,
// 그 밖(여기서는 vitest/Node)에서는 import 즉시 던지도록 만들어진 마커
// 패키지다 — 실수로 클라이언트 번들에 섞이면 빌드 타임에 바로 잡히게 하는
// 장치(M15)이므로, 테스트에서는 무해하게 만든다.
vi.mock("server-only", () => ({}));

const { generateInviteCode } = await import("@/lib/generate-invite-code");

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
