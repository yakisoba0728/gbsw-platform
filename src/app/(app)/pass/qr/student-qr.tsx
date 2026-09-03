"use client";

import { useEffect, useRef, useState } from "react";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { classify, endedMessage, keepWhileOffline } from "./qr-refresh";

export type QrPayload = {
  qr: { size: number; d: string };
  validUntil: string;
};

const SETTLE_MS = 300;

const RETRY_MS = 3000;

const MIN_DELAY_MS = 500;

const DISCONNECTED = "연결이 끊겨 코드를 받지 못했습니다.";

async function endedReason(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const code = (body as { error?: unknown })?.error;
    if (typeof code === "string") return code;
  } catch {
    // 본문이 없거나 JSON이 아니면 일반 문구로 떨어진다.
  }
  return null;
}

export function StudentQr({ initial }: { initial: QrPayload }) {
  const [payload, setPayload] = useState<QrPayload | null>(initial);
  const [stale, setStale] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const deadlineRef = useRef(new Date(initial.validUntil).getTime());

  const [barMs, setBarMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/pass/qr", { cache: "no-store" });

        // 재학 종료·세션 만료는 되물어도 답이 달라지지 않는다. 코드를 지우고 멈춘다 —
        // 굳은 QR을 띄운 채 3.3초마다 되묻는 것은 학생에게 거짓말이고 서버에는
        // 시간당 천 건 넘는 요청이다.
        const outcome = classify(response.status);
        if (outcome === "ended") {
          const reason = await endedReason(response);
          if (cancelled) return;
          setPayload(null);
          setBarMs(null);
          setEnded(endedMessage(reason));
          return;
        }
        if (outcome === "retry") throw new Error(String(response.status));

        const next: QrPayload = await response.json();
        if (cancelled) return;
        deadlineRef.current = new Date(next.validUntil).getTime();
        setStale(false);
        setPayload(next);
      } catch {
        if (cancelled) return;
        deadlineRef.current = Date.now() + RETRY_MS;
        setStale(true);
        // 유효 시간이 지난 코드는 스캔되지 않는다. 연결이 돌아오길 기다리는 동안
        // 화면에 남겨 두면 학생이 정문에서 그것을 내민다.
        setPayload((current) =>
          keepWhileOffline(current?.validUntil, Date.now()) ? current : null,
        );
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

  if (ended !== null) {
    return <EmptyState variant="inside">{ended}</EmptyState>;
  }

  if (!payload) {
    return <EmptyState variant="inside">{DISCONNECTED}</EmptyState>;
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
        {stale ? "연결이 끊겨 코드가 굳었습니다." : "20초마다 새 코드로 바뀝니다."}
      </p>
    </div>
  );
}
