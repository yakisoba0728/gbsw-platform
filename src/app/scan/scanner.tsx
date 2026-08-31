"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { tokenFromScanUrl } from "@/modules/pass/pass.url";
import { scanAction } from "./actions";
import { EMPTY_SCAN_STATE } from "./scan-state";
import {
  createQrDetector,
  type Detector,
  type DetectorCtor,
} from "./scanner-detector";
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
    "ok" | "unsupported" | "insecure" | "error" | null
  >(null);
  const [startupError, setStartupError] = useState<{
    kind: "detector" | "camera";
    message: string;
  } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, action, pending] = useActionState(scanAction, EMPTY_SCAN_STATE);
  const guideId = useId();
  const statusId = useId();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let detector: Detector | null = null;

    /**
     * 카메라를 끈다. **여러 번 불려도 안전해야 한다** — 정리와 `pagehide`가
     * 같은 이동에서 둘 다 부를 수 있다.
     *
     * 트랙을 멈추는 것만으로는 부족하다. `<video>`가 스트림을 계속 물고 있으면
     * 브라우저에 따라 렌즈 표시등이 남으므로 `srcObject`까지 비운다.
     */
    function stopCamera() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    }

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
      // **여기서 다시 본다.** 위의 await 사이에 화면을 떠났을 수 있고, 그때
      // 조건 없이 예약하면 정리가 끝난 뒤에도 루프가 한 바퀴 더 돈다.
      if (stopped) return;
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
      const setup = createQrDetector(ctor);
      if (!setup.ok) {
        setSupported("error");
        setStartupError({ kind: "detector", message: setup.message });
        return;
      }
      detector = setup.detector;
      setSupported("ok");

      let opened: MediaStream;
      try {
        opened = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        setSupported("error");
        setStartupError({
          kind: "camera",
          message: "카메라를 열지 못했습니다. 권한을 확인하세요.",
        });
        return;
      }

      // **이 await 사이에 화면을 떠났을 수 있다.** 그때 정리는 이미 지나갔고
      // `stream`은 아직 null이었으므로 아무것도 안 껐다 — 여기서 직접 끄지
      // 않으면 카메라가 영영 켜진 채 남는다. 화면을 나가도 렌즈 표시등이
      // 한참 뒤에야 꺼지던 원인이 이것이다.
      if (stopped || !videoRef.current) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = opened;
      videoRef.current.srcObject = opened;
      try {
        await videoRef.current.play();
      } catch {
        // 재생 거부는 무시한다 — 프레임은 여전히 읽힌다.
      }
      // play()도 기다리는 자리다. 같은 이유로 한 번 더 본다.
      if (stopped) {
        stopCamera();
        return;
      }
      setCameraReady(true);
      void tick();
    }

    void start();

    /**
     * 화면을 떠나는 다른 길. React가 언마운트를 못 보는 경우 —— 탭을 닫거나,
     * 브라우저가 페이지를 bfcache로 넣거나, 앱을 뒤로 보내는 때 —— 를 받는다.
     */
    window.addEventListener("pagehide", stopCamera);

    return () => {
      window.removeEventListener("pagehide", stopCamera);
      stopCamera();
    };
  }, [origin, attempt]);

  function retryCamera() {
    setStartupError(null);
    setCameraReady(false);
    setSupported(null);
    setAttempt((current) => current + 1);
  }

  const status =
    startupError
      ? startupError.message
      : supported === null
        ? "카메라를 준비하는 중입니다."
        : pending
          ? "읽은 학생증을 확인하는 중입니다."
          : state.result
            ? "판정 결과가 표시되었습니다. 다음 학생증 QR 코드를 비춰 주세요."
            : supported === "ok" && !cameraReady
              ? "카메라를 연결하고 있습니다. 권한 요청이 보이면 허용해 주세요."
              : supported === "ok"
                ? "스캔할 준비가 되었습니다. 학생증 QR 코드를 카메라에 비춰 주세요."
                : "폰 기본 카메라로 학생증 QR 코드를 찍어 주세요.";

  return (
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] @3xl:items-start">
        <section className="space-y-3 @3xl:order-2" aria-labelledby={guideId}>
          <SectionCard
            title={<span id={guideId}>스캔 방법</span>}
            variant="panel"
          >
            <ol className="list-inside list-decimal space-y-1 text-caption text-mut">
              <li>학생증의 QR 코드가 네모 안에 들어오게 비춥니다.</li>
              <li>판정 결과가 나오면 다음 학생증을 비춥니다.</li>
            </ol>
            <p
              id={statusId}
              className="mt-3 border-t border-line2 pt-3 text-caption font-medium text-ink"
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
          </SectionCard>

          <div aria-live="polite" aria-busy={pending} className="space-y-3">
            {state.error && <Note tone="error">{state.error}</Note>}
            {state.result && <VerdictCard result={state.result} />}
          </div>
        </section>

        <section
          className="space-y-3 @3xl:order-1"
          aria-label="학생증 카메라 스캔"
        >
          {/* 카메라를 못 열면 상자를 걷는다 — 남겨 두면 오류 배너 위에 검은 사각형이
              그대로 서서, 잠깐 로딩 중인 것처럼 읽힌다. */}
          {supported === "ok" && !startupError && (
            <div className={cardClass("flush", "relative overflow-hidden")}>
              {/* muted·playsInline이 없으면 iOS가 전체화면으로 띄운다. */}
              <video
                ref={videoRef}
                className="aspect-square w-full bg-ink object-cover"
                aria-label="학생증 QR 코드 스캔 카메라 화면"
                aria-describedby={`${guideId} ${statusId}`}
                muted
                playsInline
              />
              {!cameraReady && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/70 text-caption font-medium text-white">
                  카메라 연결 중…
                </span>
              )}
            </div>
          )}

          {supported === "insecure" && (
            <Note tone="warn">
              http로 열려 있어 카메라를 쓸 수 없습니다. 폰 기본 카메라로 QR을 찍으세요.
            </Note>
          )}
          {supported === "unsupported" && (
            <Note tone="warn">
              이 브라우저는 카메라 스캔을 지원하지 않습니다. 폰 기본 카메라로 QR을
              찍으세요.
            </Note>
          )}
          {startupError && (
            <div className="space-y-3">
              <Note tone="error">{startupError.message}</Note>
              <Button
                type="button"
                variant="secondary"
                full
                aria-label={`${startupError.kind === "detector" ? "QR 스캔" : "카메라"} 다시 시도`}
                onClick={retryCamera}
              >
                다시 시도
              </Button>
            </div>
          )}
        </section>
      </div>

      <form ref={formRef} action={action} className="hidden">
        <input ref={codeRef} type="hidden" name="code" />
      </form>
    </div>
  );
}
