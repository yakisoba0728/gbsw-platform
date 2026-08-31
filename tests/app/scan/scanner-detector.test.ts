import { describe, expect, it } from "vitest";
import {
  createQrDetector,
  DETECTOR_START_ERROR,
} from "@/app/scan/scanner-detector";

describe("createQrDetector", () => {
  it("QR 형식을 지원하지 않는 생성자 오류를 폴백 상태로 바꾼다", () => {
    let received: { formats: string[] } | undefined;

    class UnsupportedDetector {
      constructor(options: { formats: string[] }) {
        received = options;
        throw new DOMException("Unsupported format", "NotSupportedError");
      }

      async detect(): Promise<never[]> {
        return [];
      }
    }

    expect(createQrDetector(UnsupportedDetector)).toEqual({
      ok: false,
      message: DETECTOR_START_ERROR,
    });
    expect(received).toEqual({ formats: ["qr_code"] });
  });

  it("생성한 검출기를 그대로 반환한다", () => {
    class WorkingDetector {
      async detect(): Promise<never[]> {
        return [];
      }
    }

    const setup = createQrDetector(WorkingDetector);

    expect(setup.ok).toBe(true);
    if (setup.ok) expect(setup.detector).toBeInstanceOf(WorkingDetector);
  });
});
