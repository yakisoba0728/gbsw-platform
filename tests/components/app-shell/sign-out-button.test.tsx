// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/core/auth/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));

const { SignOutButton } = await import("@/components/app-shell/sign-out-button");

let root: Root | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.signOut.mockReset();
  mocks.replace.mockReset();
  mocks.refresh.mockReset();
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    root = undefined;
    await act(async () => mounted.unmount());
  }
  document.body.replaceChildren();
});

async function renderButton(): Promise<HTMLButtonElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<SignOutButton />));
  const button = container.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("로그아웃 버튼을 찾지 못했습니다.");
  }
  return button;
}

describe("로그아웃 버튼", () => {
  it("로그아웃 응답이 실패하면 이동하지 않고 다시 누를 수 있다", async () => {
    mocks.signOut.mockResolvedValue({
      data: null,
      error: { status: 500, statusText: "Internal Server Error" },
    });
    const button = await renderButton();

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect({ disabled: button.disabled, redirects: mocks.replace.mock.calls }).toEqual({
      disabled: false,
      redirects: [],
    });
  });

  it("로그아웃 요청 자체가 실패해도 다시 누를 수 있다", async () => {
    mocks.signOut.mockRejectedValue(new Error("network unavailable"));
    const button = await renderButton();

    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect({ disabled: button.disabled, redirects: mocks.replace.mock.calls }).toEqual({
      disabled: false,
      redirects: [],
    });
  });
});
