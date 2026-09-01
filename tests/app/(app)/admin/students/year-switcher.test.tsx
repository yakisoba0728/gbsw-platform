import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/admin/students/actions", () => ({
  createYearAction: vi.fn(),
  setCurrentYearAction: vi.fn(),
}));

const { YearSwitcher } = await import(
  "@/app/(app)/admin/students/year-switcher"
);

describe("YearSwitcher", () => {
  it("현재 학년도가 없으면 첫 학년도를 고르고, 목록도 없으면 지정 버튼을 막는다", () => {
    const withYears = renderToStaticMarkup(
      <YearSwitcher
        years={[
          { year: 2026, isCurrent: false },
          { year: 2027, isCurrent: false },
        ]}
      />,
    );
    const selectedTrigger = withYears.match(
      /<button[^>]*>현재로 지정<\/button>/,
    )?.[0];

    expect(withYears).toContain('<option value="2026" selected="">');
    expect(withYears).toContain(
      "2026학년도를 현재로 지정합니다. 전교 집계와 명단이 이 학년도를 기준으로 바뀝니다.",
    );
    expect(selectedTrigger).toBeDefined();
    expect(selectedTrigger).not.toContain(' disabled=""');

    const withoutYears = renderToStaticMarkup(<YearSwitcher years={[]} />);
    const emptyTrigger = withoutYears.match(
      /<button[^>]*>현재로 지정<\/button>/,
    )?.[0];
    expect(emptyTrigger).toContain(' disabled=""');
  });
});
