import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("우리 앱 안의 경로를 통과시킨다", () => {
    expect(safeNext("/pass")).toBe("/pass");
    expect(safeNext("/scan?c=abc.def")).toBe("/scan?c=abc.def");
  });

  it.each([
    ["다른 사이트", "https://evil.example/"],
    ["프로토콜 상대 주소", "//evil.example/"],
    ["역슬래시 우회", "/\\evil.example"],
    ["스킴", "javascript:alert(1)"],
    ["경로가 아님", "pass"],
    ["빈 값", ""],
    ["문자열이 아님", 42],
    ["없음", undefined],
    ["줄바꿈 주입", "/pass\nSet-Cookie: x=1"],
    ["탭", "/pass\tx"],
  ])("%s는 막는다", (_label, value) => {
    expect(safeNext(value)).toBeNull();
  });

  it("터무니없이 긴 값은 막는다", () => {
    expect(safeNext(`/${"a".repeat(600)}`)).toBeNull();
  });
});
