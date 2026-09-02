import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { matrixToPath, toQrPath } from "@/modules/pass/pass.qr";

describe("matrixToPath", () => {
  it("가로로 이어진 칸을 한 조각으로 묶는다", () => {
    const path = matrixToPath([
      [true, true, false],
      [false, true, true],
    ]);
    expect(path).toBe("M0 0h2v1h-2zM1 1h2v1h-2z");
  });

  it("한 줄에 떨어진 두 덩어리는 두 조각이다", () => {
    expect(matrixToPath([[true, false, true]])).toBe("M0 0h1v1h-1zM2 0h1v1h-1z");
  });

  it("빈 매트릭스는 빈 문자열이다", () => {
    expect(matrixToPath([[false, false]])).toBe("");
  });
});

describe("toQrPath", () => {
  const URL_LIKE = "https://gbsw.example.kr/scan?c=clx0000000000000000000abc.AAAAAAAAAAAAAAAA";

  it("우리 주소 길이면 35×35(버전 4)로 나온다", () => {
    expect(toQrPath(URL_LIKE).size).toBe(35);
  });

  it("path는 M으로 시작하고 비어 있지 않다", () => {
    const { d } = toQrPath(URL_LIKE);
    expect(d.startsWith("M")).toBe(true);
    expect(d.length).toBeGreaterThan(100);
  });

  it("같은 글자는 같은 그림, 다른 글자는 다른 그림", () => {
    expect(toQrPath(URL_LIKE).d).toBe(toQrPath(URL_LIKE).d);
    expect(toQrPath(URL_LIKE).d).not.toBe(toQrPath(`${URL_LIKE}x`).d);
  });
});
