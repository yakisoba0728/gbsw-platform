import { describe, expect, it } from "vitest";
import {
  filterRules,
  groupRules,
  optionLabel,
  type RuleOption,
} from "@/components/merit/rule-filter";

function rule(
  id: string,
  kind: string,
  label: string,
  points: number,
  category: string | null,
): RuleOption {
  return { id, kind, label, points, category };
}

// 서비스가 내려주는 순서 그대로 (종류 → 분류 → 점수). 여기서 다시 정렬하지 않는다.
const RULES = [
  rule("m1", "MERIT", "교내 봉사활동 우수 참여", 5, "봉사"),
  rule("m2", "MERIT", "학급 환경 정리 우수", 3, "봉사"),
  rule("m3", "MERIT", "교외 대회 입상", 10, "표창"),
  rule("d1", "DEMERIT", "인원 점검 시 지각", 3, "기숙사 생활"),
  rule("d2", "DEMERIT", "교내·외에서 흡연", 20, "생활"),
  rule("o1", "OFFSET", "선도관리위원회 징계후 상쇄", 60, null),
];

describe("규정 검색", () => {
  it("빈 검색어는 전부 통과시킨다", () => {
    expect(filterRules(RULES, "")).toHaveLength(RULES.length);
    expect(filterRules(RULES, "   ")).toHaveLength(RULES.length);
  });

  it("항목명으로 찾는다", () => {
    expect(filterRules(RULES, "흡연").map((r) => r.id)).toEqual(["d2"]);
  });

  it("분류로도 찾는다", () => {
    // "봉사"는 m2의 항목명에 없고 분류에만 있다. 분류를 안 보면 이 줄이 빠진다.
    expect(filterRules(RULES, "봉사").map((r) => r.id)).toEqual(["m1", "m2"]);
  });

  it("띄어 쓴 낱말은 전부 들어맞아야 한다", () => {
    // 사람은 "점호 지각"이라 치지만 규정 이름은 "인원 점검 시 지각"이다.
    expect(filterRules(RULES, "점검 지각").map((r) => r.id)).toEqual(["d1"]);
    expect(filterRules(RULES, "지각 점검").map((r) => r.id)).toEqual(["d1"]);
    expect(filterRules(RULES, "점검 흡연")).toEqual([]);
  });

  it("대소문자를 가리지 않는다", () => {
    const ascii = [rule("x", "MERIT", "TOPCIT 응시", 5, "Contest")];
    expect(filterRules(ascii, "topcit")).toHaveLength(1);
    expect(filterRules(ascii, "contest")).toHaveLength(1);
  });

  it("분류가 없는 규정도 터지지 않는다", () => {
    expect(filterRules(RULES, "상쇄").map((r) => r.id)).toEqual(["o1"]);
  });
});

describe("규정 묶기", () => {
  it("연속된 같은 (종류·분류)를 한 묶음으로 접는다", () => {
    const groups = groupRules(RULES);
    expect(groups.map((g) => g.label)).toEqual([
      "상점 · 봉사",
      "상점 · 표창",
      "벌점 · 기숙사 생활",
      "벌점 · 생활",
      "상쇄점 · 분류 없음",
    ]);
    expect(groups[0].items.map((i) => i.rule.id)).toEqual(["m1", "m2"]);
  });

  it("묶음 안의 index가 목록 전체에서의 자리다", () => {
    const groups = groupRules(RULES);
    expect(groups.flatMap((g) => g.items.map((i) => i.index))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("걸러낸 뒤에도 자리 번호가 이어진다", () => {
    const groups = groupRules(filterRules(RULES, "봉사"));
    expect(groups.flatMap((g) => g.items.map((i) => i.index))).toEqual([0, 1]);
  });
});

describe("선택지 표기", () => {
  it("시안대로 [상 5점] 항목명", () => {
    expect(optionLabel(RULES[0])).toBe("[상 5점] 교내 봉사활동 우수 참여");
    expect(optionLabel(RULES[3])).toBe("[벌 3점] 인원 점검 시 지각");
    expect(optionLabel(RULES[5])).toBe("[상쇄 60점] 선도관리위원회 징계후 상쇄");
  });
});
