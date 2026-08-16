import { describe, expect, it, vi } from "vitest";

// "server-only"는 웹팩의 react-server 조건에서만 무해한 empty.js로 풀리고,
// 그 밖(여기서는 vitest/Node)에서는 import 즉시 던지도록 만들어진 마커
// 패키지다 — 실수로 클라이언트 번들에 섞이면 빌드 타임에 바로 잡히게 하는
// 장치(M15)이므로, 테스트에서는 무해하게 만든다.
vi.mock("server-only", () => ({}));

const { generateInviteCode } = await import("@/lib/generate-invite-code");
const { formatInviteCode, normalizeInviteCode } = await import("@/lib/invite-code");
const { formatInviteCodeInput } = await import("@/lib/masks");

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

  /**
   * BODY_LENGTH를 혼자 올렸을 때 **조용히 깨지는 자리**를 못 박는다.
   *
   * 등록 화면의 입력 마스크(formatInviteCodeInput)는 본문을 8자에서 자른다.
   * 생성기만 길게 바꾸면 새로 발급한 코드가 입력칸에서 잘려 가입 자체가 안 되는데,
   * 위의 형식 테스트도 normalizeInviteCode 테스트도 그건 못 잡는다 — 발급부터
   * 입력까지 실제 경로를 그대로 태워야 보인다.
   */
  it("발급한 코드가 표시·입력 마스크를 거쳐도 그대로 돌아온다", () => {
    for (let i = 0; i < 100; i += 1) {
      const code = generateInviteCode();
      // 관리자 화면이 보여주는 형태 → 학생이 그대로 붙여넣었을 때 마스크가 만드는 값
      const typed = formatInviteCodeInput(formatInviteCode(code));
      expect(normalizeInviteCode(typed)).toBe(code);
    }
  });
});
