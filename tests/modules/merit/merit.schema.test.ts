import { describe, expect, it } from "vitest";
import {
  awardSchema,
  createRuleSchema,
  updateRuleSchema,
} from "@/modules/merit/merit.schema";

const valid = {
  track: "SCHOOL",
  kind: "MERIT",
  label: "교내 봉사활동 우수 참여",
  points: "5",
  category: "봉사",
  description: "",
};

describe("createRuleSchema", () => {
  it("정상 입력을 통과시키고 points를 숫자로 바꾼다", () => {
    const parsed = createRuleSchema.parse(valid);
    expect(parsed.points).toBe(5);
    expect(parsed.track).toBe("SCHOOL");
  });

  it("빈 문자열 category·description은 null이 된다", () => {
    const parsed = createRuleSchema.parse(valid);
    expect(parsed.category).toBe("봉사");
    expect(parsed.description).toBeNull();
  });

  it("점수는 양수여야 한다 — 부호는 kind가 정한다", () => {
    expect(createRuleSchema.safeParse({ ...valid, points: "0" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "-3" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "1.5" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "abc" }).success).toBe(false);
  });

  it("모르는 트랙·종류는 거부한다", () => {
    expect(createRuleSchema.safeParse({ ...valid, track: "CLUB" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, kind: "BONUS" }).success).toBe(false);
  });

  it("항목명은 비어 있을 수 없다", () => {
    expect(createRuleSchema.safeParse({ ...valid, label: "" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, label: "   " }).success).toBe(false);
  });
});

describe("updateRuleSchema", () => {
  it("track·kind는 아예 받지 않는다 — 생성 시 고정이다", () => {
    const parsed = updateRuleSchema.parse({
      ruleId: "r-1",
      label: "고친 이름",
      points: "7",
      category: "",
      description: "",
      track: "DORM",
      kind: "DEMERIT",
    });
    expect(parsed).not.toHaveProperty("track");
    expect(parsed).not.toHaveProperty("kind");
    expect(parsed.label).toBe("고친 이름");
    expect(parsed.points).toBe(7);
  });

  it("ruleId가 없으면 거부한다", () => {
    expect(
      updateRuleSchema.safeParse({ label: "x", points: "1" }).success,
    ).toBe(false);
  });
});

/**
 * 선택 입력의 길이 초과는 **오류**여야 한다. 예전엔 `.catch(null)`이 붙어 있어서
 * 한계를 넘긴 메모가 조용히 null이 됐다 — 화면에는 "부여했습니다"가 뜨고 메모만
 * 사라지는, 아무도 눈치채지 못하는 실패였다.
 */
describe("선택 입력(메모·분류·설명)의 길이", () => {
  it("분류가 50자를 넘으면 거부한다 — 조용히 버리지 않는다", () => {
    const result = createRuleSchema.safeParse({ ...valid, category: "가".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("메모가 500자를 넘으면 거부한다", () => {
    const result = awardSchema.safeParse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: "가".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("한계 안의 값은 그대로 통과한다", () => {
    const note = "가".repeat(500);
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note,
    });
    expect(parsed.note).toBe(note);
  });

  it("칸이 아예 없으면(null) null로 떨어진다 — 폼에 그 입력이 없는 경우다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: null,
    });
    expect(parsed.note).toBeNull();
  });

  it("공백만 있으면 null이다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: "   ",
    });
    expect(parsed.note).toBeNull();
  });
});
