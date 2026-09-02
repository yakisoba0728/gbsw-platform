// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt || undefined} />,
}));

vi.mock("@/components/app-shell/sign-out-button", () => ({
  SignOutButton: () => <button type="button">로그아웃</button>,
}));

const [{ MobileNav }, { Sidebar }] = await Promise.all([
  import("@/components/app-shell/mobile-nav"),
  import("@/components/app-shell/sidebar"),
]);

type Mounted = {
  container: HTMLDivElement;
  render: (node: ReactNode) => Promise<void>;
  root: Root;
};

const mounted: Mounted[] = [];

async function mount(node: ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const result = {
    container,
    root,
    render: async (next: ReactNode) => {
      await act(async () => root.render(next));
    },
  };
  mounted.push(result);
  await result.render(node);
  return result;
}

function button(container: Element, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`버튼을 찾지 못했습니다: ${label}`);
  }
  return found;
}

function currentLabels(container: Element): string[] {
  return [...container.querySelectorAll('[aria-current="page"]')].map(
    (element) => element.textContent?.trim() ?? "",
  );
}

beforeEach(() => {
  navigation.pathname = "/";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount());
    item.container.remove();
  }
});

describe("앱 메뉴 나무 렌더", () => {
  it("모바일 서랍은 묶음을 펼친 채 띄우고 역할에 맞는 항목만 그린다", async () => {
    const { container } = await mount(<MobileNav role="STUDENT" />);

    expect(button(container, "상벌점").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(container.querySelector("#drawer--merit")?.textContent).toContain(
      "내 상벌점",
    );
    expect(container.querySelector("#drawer--merit")?.textContent).toContain("규정");
    expect(container.textContent).not.toContain("상벌점 부여");
    expect(container.textContent).not.toContain("규정 관리");
  });

  it("겹치는 경로에서는 가장 구체적인 항목 하나만 현재 페이지다", async () => {
    navigation.pathname = "/merit/recent";
    const { container } = await mount(<MobileNav role="ADMIN" />);

    expect(currentLabels(container)).toEqual(["최근 부여"]);
  });

  it("사이드바는 묶음 밖에서 접혀 있고 묶음 안으로 들어가면 편다", async () => {
    const view = await mount(<Sidebar name="테스트" role="ADMIN" />);
    const merit = button(view.container, "상벌점");

    expect(merit.getAttribute("aria-expanded")).toBe("false");
    expect(view.container.querySelector("#nav--merit")).toBeNull();

    navigation.pathname = "/merit/stats";
    await view.render(<Sidebar name="테스트" role="ADMIN" />);

    expect(button(view.container, "상벌점").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(currentLabels(view.container)).toEqual(["통계"]);
  });

  it("모바일에서 접은 묶음도 pathname이 그 안에서 바뀌면 다시 편다", async () => {
    navigation.pathname = "/merit";
    const view = await mount(<MobileNav role="ADMIN" />);
    const merit = button(view.container, "상벌점");

    expect(merit.getAttribute("aria-expanded")).toBe("true");
    await act(async () => merit.click());
    expect(button(view.container, "상벌점").getAttribute("aria-expanded")).toBe(
      "false",
    );

    navigation.pathname = "/merit/stats";
    await view.render(<MobileNav role="ADMIN" />);

    expect(button(view.container, "상벌점").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(currentLabels(view.container)).toEqual(["통계"]);
  });
});
