import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth/session", () => ({
  requireAuth: async () => ({ name: "테스트", role: "STUDENT" }),
}));

vi.mock("@/components/app-shell/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/app-shell/topbar", () => ({ Topbar: () => null }));
vi.mock("@/components/app-shell/bottom-tab", () => ({ BottomTab: () => null }));

const { default: AppLayout } = await import("@/app/(app)/layout");

describe("앱 셸 접근성", () => {
  it("키보드 사용자가 반복 메뉴를 건너뛰어 본문으로 이동할 수 있다", async () => {
    const html = renderToStaticMarkup(
      await AppLayout({ children: <p>페이지 내용</p> }),
    );

    expect(html).toContain('<a href="#main-content"');
    expect(html).toContain("본문 바로가기");
    expect(html).toContain('<main id="main-content" tabindex="-1"');
  });
});
