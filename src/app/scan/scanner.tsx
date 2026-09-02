"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { tokenFromScanUrl } from "@/modules/pass/pass.url";
import { scanAction } from "./actions";
import { EMPTY_SCAN_STATE, type ScanState } from "./scan-state";
import {
  createQrDetector,
  type Detector,
  type DetectorCtor,
} from "./scanner-detector";
import { VerdictCard } from "./verdict-card";

const TICK_MS = 400;

const RESEND_MS = 3000;

export function Scanner({
  origin,
  initial = EMPTY_SCAN_STATE,
}: {
  origin: string;
  initial?: ScanState;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef<{ code: string; at: number } | null>(null);
  const [supported, setSupported] = useState<
    "ok" | "unsupported" | "insecure" | "error" | null
  >(null);
  const [startupError, setStartupError] = useState<{
    kind: "detector" | "camera";
    message: string;
  } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, action, pending] = useActionState(scanAction, initial);
  const guideId = useId();
  const statusId = useId();

  const restartCamera = useCallback(() => {
    setStartupError(null);
    setCameraReady(false);
    setSupported(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let detector: Detector | null = null;

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
        const code = found ? tokenFromScanUrl(found.rawValue, origin) : null;
        const last = sentRef.current;
        const fresh =
          !last || last.code !== code || Date.now() - last.at > RESEND_MS;
        if (code && fresh && codeRef.current && formRef.current) {
          sentRef.current = { code, at: Date.now() };
          codeRef.current.value = code;
          formRef.current.requestSubmit();
        }
      } catch {
      }
      if (stopped) return;
      timer = setTimeout(tick, TICK_MS);
    }

    async function start() {
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

      if (stopped || !videoRef.current) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }

      stream = opened;
      videoRef.current.srcObject = opened;
      try {
        await videoRef.current.play();
      } catch {
      }
      if (stopped) {
        stopCamera();
        return;
      }
      setCameraReady(true);
      void tick();
    }

    void start();

    /* BFCache 복귀는 재마운트하지 않으므로 카메라를 다시 시작한다. */
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) restartCamera();
    }

    window.addEventListener("pagehide", stopCamera);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pagehide", stopCamera);
      window.removeEventListener("pageshow", handlePageShow);
      stopCamera();
    };
  }, [origin, attempt, restartCamera]);

  const status =
    startupError
      ? startupError.message
      : supported === null
        ? "카메라를 준비하는 중입니다."
        : pending
          ? "읽은 학생증을 확인하는 중입니다."
          : supported === "ok" && !cameraReady
            ? "카메라를 연결하고 있습니다. 권한 요청이 보이면 허용해 주세요."
            : state.result
              ? "판정 결과가 표시되었습니다. 다음 학생증 QR 코드를 비춰 주세요."
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
          {supported === "ok" && !startupError && (
            <div className={cardClass("flush", "relative overflow-hidden")}>
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
                onClick={restartCamera}
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
