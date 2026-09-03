import { describe, expect, it } from "vitest";
import { optionalText, searchText } from "@/lib/zod-fields";

describe("optionalText — 선택 입력 텍스트", () => {
  const field = optionalText(50);

  it("null·undefined는 null이다", () => {
    expect(field.parse(null)).toBeNull();
    expect(field.parse(undefined)).toBeNull();
  });

  it("빈 문자열과 공백뿐인 문자열은 null이다", () => {
    expect(field.parse("")).toBeNull();
    expect(field.parse("   ")).toBeNull();
  });

  it("앞뒤 공백을 떼고 저장한다", () => {
    expect(field.parse("  봉사 활동  ")).toBe("봉사 활동");
  });

  it("최대 길이를 넘으면 거절한다", () => {
    expect(field.safeParse("가".repeat(51)).success).toBe(false);
    expect(field.safeParse("가".repeat(50)).success).toBe(true);
  });

  it("거절 메시지에 한도를 알려 준다", () => {
    const result = field.safeParse("가".repeat(51));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("50자를 넘을 수 없습니다.");
    }
  });
});

describe("searchText — 검색어", () => {
  const field = searchText();

  it("빈 문자열·공백은 필터 없음(undefined)이다", () => {
    expect(field.parse("")).toBeUndefined();
    expect(field.parse("   ")).toBeUndefined();
    expect(field.parse(undefined)).toBeUndefined();
  });

  it("앞뒤 공백을 떼고 저장한다", () => {
    expect(field.parse("  민준  ")).toBe("민준");
  });

  it("기본 한도는 60자다", () => {
    expect(field.safeParse("가".repeat(60)).success).toBe(true);
    expect(field.safeParse("가".repeat(61)).success).toBe(false);
  });

  it("한도를 바꾸면 메시지도 따라간다", () => {
    const result = searchText(10).safeParse("가".repeat(11));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("검색어는 10자를 넘을 수 없습니다.");
    }
  });
});
