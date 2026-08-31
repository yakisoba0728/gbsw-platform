import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuleTable, type RuleRow } from "@/app/(app)/admin/merit/rules/rule-table";

const RULES: RuleRow[] = [
  {
    id: "m-1",
    kind: "MERIT",
    category: "봉사",
    label: "교내 청소",
    points: 2,
    description: null,
    active: true,
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
  {
    id: "m-2",
    kind: "MERIT",
    category: "표창",
    label: "학교 홍보",
    points: 5,
    description: null,
    active: true,
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
  {
    id: "d-1",
    kind: "DEMERIT",
    category: "생활",
    label: "소란 행위",
    points: 2,
    description: null,
    active: true,
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
];

function occurrences(html: string, value: string): number {
  return html.split(value).length - 1;
}

describe("RuleTable 분류 탐색", () => {
  it("일반 목록은 첫 분류만 펼치고 나머지 분류는 표 안에 보존한다", () => {
    const html = renderToStaticMarkup(<RuleTable rules={RULES} />);

    expect(occurrences(html, 'aria-expanded="true"')).toBe(1);
    expect(occurrences(html, 'aria-expanded="false"')).toBe(2);
    expect(occurrences(html, 'hidden=""')).toBeGreaterThanOrEqual(2);
    expect(html).toContain("상점 · 봉사");
    expect(html).toContain("상점 · 표창");
    expect(html).toContain("벌점 · 생활");
    expect(html).toContain("모두 펼치기");
    expect(html).toContain("모두 접기");
  });

  it("검색 결과는 모든 분류를 펼쳐 일치한 규정을 바로 보여 준다", () => {
    const html = renderToStaticMarkup(
      <RuleTable rules={RULES} expandAllInitially />,
    );

    expect(occurrences(html, 'aria-expanded="true"')).toBe(3);
    expect(occurrences(html, 'aria-expanded="false"')).toBe(0);
    expect(html).toContain('aria-controls="rule-group-0"');
    expect(html).toContain('aria-controls="rule-group-1"');
    expect(html).toContain('aria-controls="rule-group-2"');
  });

  it("접힌 분류의 편집 버튼도 대상이 포함된 이름을 유지한다", () => {
    const html = renderToStaticMarkup(<RuleTable rules={RULES} />);

    expect(html).toContain('aria-label="교내 청소 규정 수정"');
    expect(html).toContain('aria-label="학교 홍보 규정 수정"');
    expect(html).toContain('aria-label="소란 행위 규정 수정"');
  });
});
