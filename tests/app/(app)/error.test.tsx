// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppError from "@/app/(app)/error";

let mountedRoot: Root | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  if (mountedRoot) {
    const root = mountedRoot;
    mountedRoot = undefined;
    await act(async () => root.unmount());
  }
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("앱 공용 오류 화면", () => {
  it("역할 중립 안내와 오류 번호를 보이고 같은 오류를 기록하며 다시 시도한다", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoot = root;
    const error = Object.assign(new Error("내부 원인은 화면에 내보내지 않는다"), {
      digest: "error-digest-123",
    });
    const retry = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => root.render(<AppError error={error} retry={retry} />));

    expect(container.querySelector("h2")?.textContent).toBe(
      "화면을 열지 못했습니다",
    );
    expect(container.textContent).toContain(
      "다시 시도해도 같으면 학교 담당자에게 알려 주세요.",
    );
    expect(container.textContent).not.toContain(error.message);
    expect(container.textContent).toContain("오류 번호 error-digest-123");
    expect(container.querySelector('a[href="/"]')?.textContent).toBe("대시보드");
    expect(consoleError).toHaveBeenCalledWith(error);

    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "다시 시도",
    );
    if (!(retryButton instanceof HTMLButtonElement)) {
      throw new Error("다시 시도 버튼을 찾지 못했습니다.");
    }
    await act(async () => retryButton.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
