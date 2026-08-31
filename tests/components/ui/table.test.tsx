import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { horizontalScrollTabIndex } from "@/components/ui/horizontal-scroll-region";
import { DataTable, type Column } from "@/components/ui/table";

describe("horizontalScrollTabIndex", () => {
  it.each([
    [{ clientWidth: 390, scrollWidth: 390 }, undefined],
    [{ clientWidth: 390, scrollWidth: 389 }, undefined],
    [{ clientWidth: 390, scrollWidth: 391 }, 0],
  ] as const)("실제 overflow에만 탭 정지를 둔다: %o", (metrics, expected) => {
    expect(horizontalScrollTabIndex(metrics)).toBe(expected);
  });
});

describe("DataTable 접근성 이름", () => {
  it("호출부의 문맥 이름을 region에 쓰고 서버 HTML은 탭 정지를 선점하지 않는다", () => {
    const rows = [{ id: "student-1", name: "홍길동" }];
    const columns: Column<(typeof rows)[number]>[] = [
      { key: "name", header: "이름", cell: (row) => row.name },
    ];

    const html = renderToStaticMarkup(
      <DataTable
        ariaLabel="학생 순위"
        minWidth={480}
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
      />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="학생 순위"');
    expect(html).not.toContain("tabindex=");
  });
});
