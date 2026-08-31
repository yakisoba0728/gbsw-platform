"use client";

import { useEffect, useRef, useState } from "react";
import { cardClass } from "@/components/ui/card";

export type QrPayload = {
  qr: { size: number; d: string };
  /** ISO 문자열. 이 시각에 다음 코드로 바뀐다. */
  validUntil: string;
};

/**
 * 다음 코드가 시작되고 이만큼 뒤에 받는다. 경계에 딱 맞추면 서버 시계가 몇
 * 밀리초만 뒤여도 방금 지난 코드를 받는다.
 */
const SETTLE_MS = 300;

/** 요청이 실패했을 때 다시 시도하기까지. */
const RETRY_MS = 3000;

/** 서버가 이미 지난 시각을 주더라도 이보다 자주 조르지 않는다. */
const MIN_DELAY_MS = 500;

/**
 * 20초마다 저절로 바뀌는 학생증 QR. **비밀은 여기 오지 않는다** — 서버가 이미
 * 그려진 path 문자열만 내려준다. 그래서 `<path>` 하나면 그림이 끝나고, uqr은
 * 클라이언트 번들에 들어가지 않는다.
 */
export function StudentQr({ initial }: { initial: QrPayload }) {
  const [payload, setPayload] = useState(initial);
  const [stale, setStale] = useState(false);
  /**
   * 갱신할 때마다 오른다. **이펙트가 이 값에만 매달리는 것이 핵심이다** —
   * `validUntil`에 매달면 서버가 같은 스텝의 값을 돌려줬을 때(시계가 조금 뒤지면
   * 일어난다) 의존성이 안 바뀌어 다음 타이머가 안 걸리고, QR이 영영 멈추는데
   * 「굳었다」 표시도 안 뜬다.
   */
  const [round, setRound] = useState(0);

  /** 다음 요청을 걸 시각. 렌더가 아니라 콜백에서만 고친다. */
  const deadlineRef = useRef(new Date(initial.validUntil).getTime());

  /** 막대가 실제로 남은 시간만큼 돌게 한다. 마운트 전에는 재지 않는다. */
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
        // 끊겼을 때 화면을 비우지 않는다 — 굳은 코드라고 알리고 계속 다시 시도한다.
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
      {/* p-4는 카드 여백이 아니라 QR의 여백(quiet zone)이다 — 흰 테두리가 없으면
          스캐너가 코드의 경계를 못 찾는다. 껍데기는 cardClass가 그대로 소유한다. */}
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

      {/* 남은 시간. key가 바뀌면 애니메이션이 처음부터 다시 돈다. 지속시간은
          서버가 준 validUntil에서 나오므로 코드 주기가 바뀌어도 따라간다. */}
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
          : /* 20초는 pass.token.ts의 STEP_SECONDS다. 막대와 달리 이 문장은
               서버 값에서 끌어낼 수 없어 손으로 적는다. */
            "20초마다 새 코드로 바뀝니다."}
      </p>
    </div>
  );
}
