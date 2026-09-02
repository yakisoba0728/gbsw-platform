// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SheetDownloadButton,
  type SheetResult,
  useSheetDownload,
} from "@/components/ui/sheet-download";

let root: Root | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterEach(async () => {
  if (root) {
    const mounted = root;
    root = undefined;
    await act(async () => mounted.unmount());
  }
  document.body.replaceChildren();
});

function Harness({ fetchSheet }: { fetchSheet: () => Promise<SheetResult> }) {
  return <SheetDownloadButton {...useSheetDownload(fetchSheet, [12])} />;
}

describe("스프레드시트 다운로드", () => {
  it("자료 요청이 거부되면 다시 시도할 수 있는 오류를 안내한다", async () => {
    const fetchSheet = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<Harness fetchSheet={fetchSheet} />));

    const button = container.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("내보내기 버튼을 찾지 못했습니다.");
    }
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "내보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});
