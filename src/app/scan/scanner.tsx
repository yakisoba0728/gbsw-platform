"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Note } from "@/components/ui/note";
import { tokenFromScanUrl } from "@/modules/pass/pass.url";
import { scanAction } from "./actions";
import { EMPTY_SCAN_STATE } from "./scan-state";
import { VerdictCard } from "./verdict-card";

/**
 * 브라우저의 BarcodeDetector는 표준이 아니다 — 있는지 런타임에 보고, 없으면
 * 폰 기본 카메라로 안내한다. **그 폴백이 온전한 경로다**: 기본 카메라로 찍으면
 * /scan?c=…가 열려 같은 판정이 나온다. 그래서 QR 디코딩 라이브러리를 넣지 않는다.
 */
type DetectedBarcode = { rawValue: string };
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** 프레임을 얼마나 자주 보는가. 400ms면 정문에서 체감상 즉시다. */
const TICK_MS = 400;

export function Scanner({ origin }: { origin: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  /** 마지막으로 보낸 토큰. 같은 QR을 들고 서 있으면 20초에 한 번만 보낸다. */
  const sentRef = useRef<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(scanAction, EMPTY_SCAN_STATE);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let detector: Detector | null = null;

    async function tick() {
      if (stopped || !detector || !videoRef.current) return;
      try {
        const [found] = await detector.detect(videoRef.current);
        // **읽은 주소로 이동하지 않는다.** 출처와 경로가 맞을 때만 토큰을 꺼낸다.
        const token = found ? tokenFromScanUrl(found.rawValue, origin) : null;
        // 같은 토큰을 400ms마다 다시 보내지 않는다 — 학생이 QR을 들고 가만히 서
        // 있으면 한 창(20초)에 쉰 번을 보내게 되고 판정 카드가 깜빡인다. 코드가
        // 바뀌거나 다음 학생이 오면 값이 달라져 곧바로 나간다.
        if (token && token !== sentRef.current && tokenRef.current && formRef.current) {
          sentRef.current = token;
          tokenRef.current.value = token;
          formRef.current.requestSubmit();
        }
      } catch {
        // 한 프레임 실패는 무시한다 — 다음 프레임이 있다.
      }
      timer = setTimeout(tick, TICK_MS);
    }

    /**
     * 지원 여부 판정이 여기 있는 이유: effect 본문에서 곧바로 setState를 부르면
     * react-hooks/set-state-in-effect가 막는다(연쇄 렌더). 어차피 「검출기를 만들
     * 수 있는가」는 카메라를 켜는 일의 첫 단계라 이 자리가 제자리다.
     */
    async function start() {
      const ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!ctor) {
        setSupported(false);
        return;
      }
      setSupported(true);
      detector = new ctor({ formats: ["qr_code"] });

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        void tick();
      } catch {
        setCameraError("카메라를 열지 못했습니다. 권한을 확인해 주세요.");
      }
    }

    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      // 카메라를 안 끄면 화면을 떠나도 렌즈 표시등이 켜져 있다.
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [origin]);

  return (
    <div className="space-y-4">
      {supported && (
        <div className="overflow-hidden rounded-card border border-line bg-ink">
          {/* muted·playsInline이 없으면 iOS가 전체화면으로 띄운다. */}
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
          />
        </div>
      )}

      {supported === false && (
        <Note tone="warn">
          이 브라우저는 카메라 스캔을 지원하지 않습니다 — 폰 기본 카메라로 QR을 찍으세요.
        </Note>
      )}
      {cameraError && <Note tone="error">{cameraError}</Note>}

      <form ref={formRef} action={action} className="hidden">
        <input ref={tokenRef} type="hidden" name="token" />
      </form>

      {pending && <p className="text-center text-caption text-mut">확인하는 중…</p>}
      {state.error && <Note tone="error">{state.error}</Note>}
      {state.result && <VerdictCard result={state.result} />}
    </div>
  );
}
