import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader", () => {
  it("공백 없는 최대 길이 제목도 H1 안에서 줄바꿈할 수 있다", () => {
    const title = "A".repeat(200);
    const html = renderToStaticMarkup(<PageHeader title={title} />);

    expect(html).toContain(`<h1`);
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain(title);
  });
});
