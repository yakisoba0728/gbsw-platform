export type DetectedBarcode = { rawValue: string };

export type Detector = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

export type DetectorCtor = new (options: { formats: string[] }) => Detector;

export const DETECTOR_START_ERROR =
  "QR 코드 스캔을 시작하지 못했습니다. 폰 기본 카메라를 사용하거나 다시 시도하세요.";

export type DetectorSetup =
  | { ok: true; detector: Detector }
  | { ok: false; message: typeof DETECTOR_START_ERROR };

export function createQrDetector(ctor: DetectorCtor): DetectorSetup {
  try {
    return {
      ok: true,
      detector: new ctor({ formats: ["qr_code"] }),
    };
  } catch {
    return { ok: false, message: DETECTOR_START_ERROR };
  }
}
