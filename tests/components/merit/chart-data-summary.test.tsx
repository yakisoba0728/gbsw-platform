import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartDataSummary } from "@/app/(app)/merit/stats/views/chart-data-summary";

describe("ChartDataSummary", () => {
  it("labels the summary and exposes every supplied data row", () => {
    const html = renderToStaticMarkup(
      <ChartDataSummary
        label="월별 추이"
        rows={[
          "3월: 상점 10점, 벌점 2점, 순점수 +8",
          "4월: 상점 4점, 벌점 7점, 순점수 -3",
        ]}
      />,
    );

    expect(html).toContain('aria-label="월별 추이 데이터 요약"');
    expect(html).toContain("3월: 상점 10점, 벌점 2점, 순점수 +8");
    expect(html).toContain("4월: 상점 4점, 벌점 7점, 순점수 -3");
  });

  it("does not add an empty landmark when the chart has no rows", () => {
    expect(renderToStaticMarkup(<ChartDataSummary label="월별 추이" rows={[]} />)).toBe("");
  });
});
