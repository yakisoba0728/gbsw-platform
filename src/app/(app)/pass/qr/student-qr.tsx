"use client";

import { useEffect, useRef, useState } from "react";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type QrPayload = {
  qr: { size: number; d: string };
  validUntil: string;
};

const SETTLE_MS = 300;

const RETRY_MS = 3000;

const MIN_DELAY_MS = 500;

/* live: 정상 갱신 · stale: 연결이 끊겨 재시도 중 · ended: 더 물어도 답이 같아 멈춤 */
type Mode = "live" | "stale" | "ended";

export function StudentQr({ initial }: { initial: QrPayload }) {
  const [payload, setPayload] = useState<QrPayload | null>(initial);
  const [mode, setMode] = useState<Mode>("live");
  const [round, setRound] = useState(0);

  const deadlineRef = useRef(new Date(initial.validUntil).getTime());

  const [barMs, setBarMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/pass/qr", { cache: "no-store" });

        // 4xx는 다시 물어도 답이 달라지지 않는다(재학 종료·세션 만료). 코드를 지우고
        // 멈춘다 — 굳은 QR을 띄운 채 3.3초마다 되묻는 것은 학생에게 거짓말이고
        // 서버에는 시간당 천 건 넘는 요청이다.
        if (response.status >= 400 && response.status < 500) {
          if (cancelled) return;
          setPayload(null);
          setBarMs(null);
          setMode("ended");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));

        const next: QrPayload = await response.json();
        if (cancelled) return;
        deadlineRef.current = new Date(next.validUntil).getTime();
        setMode("live");
        setPayload(next);
      } catch {
        if (cancelled) return;
        deadlineRef.current = Date.now() + RETRY_MS;
        setMode("stale");
      }
      // ended에서는 round를 올리지 않아 이 효과가 다시 돌지 않는다.
      if (!cancelled) setRound((n) => n + 1);
    }

    const delay = Math.max(MIN_DELAY_MS, deadlineRef.current - Date.now() + SETTLE_MS);
    setBarMs(delay);
    const timer = setTimeout(refresh, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [round]);

  if (mode === "ended" || !payload) {
    return (
      <EmptyState variant="inside">
        학생증을 더 쓸 수 없습니다. 화면을 새로 고치세요.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className={cardClass("flush", "p-4")}>
        <svg
          viewBox={`0 0 ${payload.qr.size} ${payload.qr.size}`}
          className="size-52 text-ink"
          shapeRendering="crispEdges"
          role="img"
          aria-label="학생증 QR 코드"
        >
          <path d={payload.qr.d} fill="currentColor" />
        </svg>
      </div>

      <div
        className="mt-3 h-1 w-52 overflow-hidden rounded-full bg-mut-soft"
        aria-hidden
      >
        {barMs !== null && (
          <div
            key={round}
            className="animate-pass-qr-tick h-full origin-left bg-pri"
            style={{ "--pass-qr-tick": `${barMs}ms` } as React.CSSProperties}
          />
        )}
      </div>

      <p className="mt-2 text-xs text-mut">
        {mode === "stale"
          ? "연결이 끊겨 코드가 굳었습니다."
          : "20초마다 새 코드로 바뀝니다."}
      </p>
    </div>
  );
}
