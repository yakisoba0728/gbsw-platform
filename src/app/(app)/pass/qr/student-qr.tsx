"use client";

import { useEffect, useRef, useState } from "react";
import { cardClass } from "@/components/ui/card";

export type QrPayload = {
  qr: { size: number; d: string };
  validUntil: string;
};

const SETTLE_MS = 300;

const RETRY_MS = 3000;

const MIN_DELAY_MS = 500;

export function StudentQr({ initial }: { initial: QrPayload }) {
  const [payload, setPayload] = useState(initial);
  const [stale, setStale] = useState(false);
  const [round, setRound] = useState(0);

  const deadlineRef = useRef(new Date(initial.validUntil).getTime());

  const [barMs, setBarMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/pass/qr", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));

        const next: QrPayload = await response.json();
        if (cancelled) return;
        deadlineRef.current = new Date(next.validUntil).getTime();
        setStale(false);
        setPayload(next);
      } catch {
        if (cancelled) return;
        deadlineRef.current = Date.now() + RETRY_MS;
        setStale(true);
      }
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
        {stale
          ? "연결이 끊겨 코드가 굳었습니다."
          :
            "20초마다 새 코드로 바뀝니다."}
      </p>
    </div>
  );
}
