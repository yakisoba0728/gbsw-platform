import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/merit/recent",
}));

const { BottomTab } = await import("@/components/app-shell/bottom-tab");

describe("BottomTab", () => {
  it("겹치는 경로에서는 가장 구체적인 탭 하나만 현재 페이지로 표시한다", () => {
    const html = renderToStaticMarkup(<BottomTab role="ADMIN" />);
    const merit = html.match(/<a[^>]*href="\/merit"[^>]*>/)?.[0];
    const recent = html.match(/<a[^>]*href="\/merit\/recent"[^>]*>/)?.[0];

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(recent).toContain('aria-current="page"');
    expect(merit).not.toContain('aria-current="page"');
  });
});
