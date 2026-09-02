import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SkeletonRegion,
  SkeletonRows,
  SkeletonScreen,
  SkeletonTable,
} from "@/components/ui/skeleton";
import AdminCommunityLoading from "@/app/(app)/admin/community/loading";
import AdminLogsLoading from "@/app/(app)/admin/logs/loading";
import AdminRulesLoading from "@/app/(app)/admin/merit/rules/loading";
import RulesLoading from "@/app/(app)/merit/rules/loading";

function count(html: string, value: string): number {
  return html.split(value).length - 1;
}

function countClass(html: string, token: string): number {
  return Array.from(html.matchAll(/class="([^"]*)"/g)).filter((match) =>
    match[1].split(" ").includes(token),
  ).length;
}

describe("SkeletonTable", () => {
  it("제목 폭과 조작부를 머리글 안에 두고 실제 표에 맞춘 행을 그린다", () => {
    const html = renderToStaticMarkup(
      <SkeletonTable
        rows={2}
        titleWidth="w-24"
        controls={<span data-testid="controls">필터 자리</span>}
      />,
    );

    expect(html).toContain("h-5 w-24");
    expect(html.indexOf("h-5 w-24")).toBeLessThan(html.indexOf("data-testid=\"controls\""));
    expect(html.indexOf("data-testid=\"controls\"")).toBeLessThan(
      html.indexOf("space-y-3 px-5 py-4"),
    );
    expect(count(html, "h-8")).toBe(2);
  });

  it("제목 폭의 기본값은 기존 w-40이다", () => {
    const html = renderToStaticMarkup(<SkeletonTable rows={1} />);

    expect(html).toContain("h-5 w-40");
  });
});

describe("스켈레톤 알림 소유권", () => {
  it("화면 fallback은 자식 모양 수와 관계없이 한 번만 알린다", () => {
    const html = renderToStaticMarkup(
      <SkeletonScreen>
        <SkeletonRows />
        <SkeletonTable />
      </SkeletonScreen>,
    );

    expect(count(html, "불러오는 중")).toBe(1);
    expect(count(html, "aria-live=\"polite\"")).toBe(1);
  });

  it("시각 모양은 알리지 않고 실제 fallback 경계가 한 번 알린다", () => {
    const visualOnly = renderToStaticMarkup(
      <>
        <SkeletonRows />
        <SkeletonTable />
      </>,
    );
    const fallback = renderToStaticMarkup(
      <SkeletonRegion>
        <SkeletonTable />
      </SkeletonRegion>,
    );

    expect(visualOnly).not.toContain("불러오는 중");
    expect(visualOnly).not.toContain("aria-live");
    expect(count(fallback, "불러오는 중")).toBe(1);
    expect(count(fallback, "aria-live=\"polite\"")).toBe(1);
  });
});

describe("표 화면 loading", () => {
  it("감사로그는 두 줄 조작부와 열 행을 공용 표에 그대로 둔다", () => {
    const html = renderToStaticMarkup(<AdminLogsLoading />);

    expect(countClass(html, "w-20")).toBe(14);
    expect(countClass(html, "h-8")).toBe(10);
    expect(count(html, "불러오는 중")).toBe(1);
  });

  it("각 표의 행 수를 유지하고 화면마다 한 번만 알린다", () => {
    const screens = [
      [renderToStaticMarkup(<AdminCommunityLoading />), 5],
      [renderToStaticMarkup(<AdminRulesLoading />), 10],
      [renderToStaticMarkup(<RulesLoading />), 10],
    ] as const;

    for (const [html, rows] of screens) {
      expect(countClass(html, "h-8")).toBe(rows);
      expect(count(html, "불러오는 중")).toBe(1);
    }
  });
});
