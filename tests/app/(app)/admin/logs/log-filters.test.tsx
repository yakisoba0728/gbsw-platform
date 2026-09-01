import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/logs",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { LogFilters } = await import("@/app/(app)/admin/logs/log-filters");

describe("LogFilters", () => {
  it("기간 버튼을 보이는 제목이 있는 그룹으로 묶는다", () => {
    const html = renderToStaticMarkup(
      <LogFilters actions={[]} period="today" action="" actor="" />,
    );

    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain(">기간</legend>");
    expect(html).not.toContain('for="log-period"');
  });
});
