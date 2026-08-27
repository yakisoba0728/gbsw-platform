"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Note } from "@/components/ui/note";
import { tokenFromScanUrl } from "@/modules/pass/pass.url";
import { scanAction } from "./actions";
import { EMPTY_SCAN_STATE } from "./scan-state";
import { VerdictCard } from "./verdict-card";

/**
 * 사이트 안 스캐너. 못 쓰는 경우가 둘인데 **원인이 다르고 할 일도 다르다.**
 *
 * - `http`로 열렸다 → 브라우저가 카메라 API를 통째로 감춘다. 고칠 사람은 서버에
 *   인증서를 붙여야 한다. 「이 브라우저는 지원하지 않습니다」라고 하면 멀쩡한 폰을
 *   탓하게 된다 (교내 LAN 테스트 배포에서 실제로 그랬다).
 * - `BarcodeDetector`가 없다 → 그 브라우저의 사정이다. 다른 브라우저로 열면 된다.
 *
 * **어느 쪽이든 폴백은 온전한 경로다**: 폰 기본 카메라로 찍으면 /scan?c=…가 열려
 * 같은 판정이 나온다. 그래서 QR 디코딩 라이브러리를 넣지 않는다.
 */
type DetectedBarcode = { rawValue: string };
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

/** 프레임을 얼마나 자주 보는가. 400ms면 정문에서 체감상 즉시다. */
const TICK_MS = 400;

/**
 * 같은 학생증을 다시 보내기까지 기다리는 시간. 정문에서 한 학생이 지나가고
 * 다음 학생이 오는 데 걸리는 시간보다 짧아야 하고, 카드가 깜빡이지 않을 만큼은
 * 길어야 한다.
 */
const RESEND_MS = 3000;

export function Scanner({ origin }: { origin: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  /**
   * 마지막으로 보낸 코드와 그 시각.
   *
   * **학생증은 값이 안 바뀐다.** 예전 출입증 QR은 20초마다 갈려서 「같은 값이면
   * 건너뛴다」로 충분했지만, 지금 그렇게 두면 같은 학생을 두 번째로 찍을 방법이
   * 화면을 새로 고치는 것뿐이 된다. 그래서 값이 아니라 **시간 창**으로 막는다.
   */
  const sentRef = useRef<{ code: string; at: number } | null>(null);
  /** null은 아직 확인 전. 셋으로 갈리는 이유는 안내 문구가 갈리기 때문이다. */
  const [supported, setSupported] = useState<
    "ok" | "unsupported" | "insecure" | null
  >(null);
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
        const code = found ? tokenFromScanUrl(found.rawValue, origin) : null;
        // 같은 코드를 400ms마다 다시 보내지 않는다 — 학생이 QR을 들고 서 있으면
        // 초당 두 번씩 보내게 되고 판정 카드가 깜빡인다. 다음 학생이 오면 값이
        // 달라져 곧바로 나가고, 같은 학생이라도 창을 넘기면 다시 나간다.
        const last = sentRef.current;
        const fresh =
          !last || last.code !== code || Date.now() - last.at > RESEND_MS;
        if (code && fresh && codeRef.current && formRef.current) {
          sentRef.current = { code, at: Date.now() };
          codeRef.current.value = code;
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
      // **먼저 안전한 맥락인지 본다.** http로 열면 브라우저가 BarcodeDetector도
      // getUserMedia도 아예 감춘다 — 그때 「이 브라우저는 지원하지 않습니다」라고
      // 하면 멀쩡한 폰을 탓하게 되고, 고칠 사람은 주소를 https로 바꿔야 한다는
      // 것을 영영 모른다.
      if (!window.isSecureContext) {
        setSupported("insecure");
        return;
      }

      const ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!ctor) {
        setSupported("unsupported");
        return;
      }
      setSupported("ok");
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
      {/* 카메라를 못 열면 상자를 걷는다 — 남겨 두면 오류 배너 위에 검은 사각형이
          그대로 서서, 잠깐 로딩 중인 것처럼 읽힌다. */}
      {supported === "ok" && !cameraError && (
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

      {supported === "insecure" && (
        <Note tone="warn">
          http로 열려 있어 카메라를 쓸 수 없습니다 — 폰 기본 카메라로 QR을 찍으세요.
          (주소가 https가 되면 여기서 바로 스캔할 수 있습니다.)
        </Note>
      )}
      {supported === "unsupported" && (
        <Note tone="warn">
          이 브라우저는 카메라 스캔을 지원하지 않습니다 — 폰 기본 카메라로 QR을 찍으세요.
        </Note>
      )}
      {cameraError && <Note tone="error">{cameraError}</Note>}

      <form ref={formRef} action={action} className="hidden">
        <input ref={codeRef} type="hidden" name="code" />
      </form>

      {pending && <p className="text-center text-caption text-mut">확인하는 중…</p>}
      {state.error && <Note tone="error">{state.error}</Note>}
      {state.result && <VerdictCard result={state.result} />}
    </div>
  );
}
