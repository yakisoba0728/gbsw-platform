import { describe, expect, it } from "vitest";
import { isLoginBlocked } from "@/core/auth/login-eligibility";

describe("isLoginBlocked()", () => {
  it("사용자가 없으면 막는다", () => {
    expect(isLoginBlocked(null)).toBe(true);
    expect(isLoginBlocked(undefined)).toBe(true);
  });

  it("status가 ACTIVE가 아니면 막는다", () => {
    expect(isLoginBlocked({ status: "INACTIVE", deletedAt: null })).toBe(true);
    expect(isLoginBlocked({ status: null, deletedAt: null })).toBe(true);
  });

  it("deletedAt이 찍혀 있으면 status와 무관하게 막는다" +
    "정확히 같은 구멍(비활성 계정이 재로그인으로 복귀)이 소프트 삭제에도 " +
    "생기지 않게 한다", () => {
    expect(isLoginBlocked({ status: "ACTIVE", deletedAt: new Date() })).toBe(true);
  });

  it("status가 ACTIVE고 deletedAt이 없으면 통과시킨다", () => {
    expect(isLoginBlocked({ status: "ACTIVE", deletedAt: null })).toBe(false);
  });

  it("deletedAt 필드 자체가 없어도(옛 세션 스냅샷 등) status만으로 판단한다", () => {
    expect(isLoginBlocked({ status: "ACTIVE" })).toBe(false);
  });
});
