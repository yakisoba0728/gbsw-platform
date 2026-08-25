"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 한 줄로 자르고, 마우스를 올리면 전문을 띄운다.
 *
 * **네이티브 `title`을 쓰지 않는다.** 브라우저가 긴 글을 제 마음대로 잘라 끝을
 * 안 보여주고(그러면 잘라 놓은 의미가 없다), 뜨기까지 1초 넘게 걸리며, 표의
 * 규격과 아무 상관 없는 모양으로 그려진다.
 *
 * **말풍선은 `position: fixed`다.** 표는 가로 스크롤 상자(`scroll-x-hint`) 안에
 * 있어서 `absolute`로 띄우면 그 상자에 잘린다 — 정작 잘린 글을 보여주려는
 * 말풍선이 잘린다. fixed는 뷰포트를 기준으로 삼아 상자를 벗어난다.
 *
 * 실제로 잘렸을 때만 띄운다. 다 보이는 글에 말풍선이 뜨면 손이 지나갈 때마다
 * 화면이 깜빡인다.
 */
export function TruncatedText({
  full,
  className,
  children,
}: {
  /** 말풍선에 띄울 전문. 줄바꿈을 담을 수 있다. */
  full: string;
  className?: string;
  /** 화면에 세울 잘린 내용. 색이 섞인 조각이라 문자열이 아니라 노드로 받는다. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(
    null,
  );

  // 스크롤하면 말풍선만 제자리에 남는다 — 가리키던 글자와 어긋나므로 내린다.
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  function open() {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    const rect = el.getBoundingClientRect();
    // 오른쪽 끝에서 말풍선이 화면 밖으로 나가지 않게 왼쪽으로 당긴다.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MAX_WIDTH - 8));

    // 아래에 자리가 없으면 위로 띄운다. 높이를 미리 못 재므로 top 대신 bottom을
    // 줘서 브라우저가 알아서 올려 그리게 한다.
    setAt(
      rect.bottom > window.innerHeight - 140
        ? { left, bottom: window.innerHeight - rect.top + 6 }
        : { left, top: rect.bottom + 6 },
    );
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={open}
        onMouseLeave={() => setAt(null)}
        // 읽어 주는 것은 아래 sr-only 전문이다 — 잘린 글까지 읽으면 두 번 읽는다.
        aria-hidden
        // nowrap이 빠지면 글이 접혀 버려 잘리지 않는다 — 줄이 늘어나고,
        // scrollWidth가 clientWidth를 넘지 않아 말풍선도 안 뜬다.
        className={cn("block overflow-hidden text-ellipsis whitespace-nowrap", className)}
      >
        {children}
      </span>
      <span className="sr-only">{full}</span>

      {at && (
        <span
          role="tooltip"
          style={{ left: at.left, top: at.top, bottom: at.bottom, maxWidth: MAX_WIDTH }}
          className="fixed z-50 rounded-btn border border-line bg-surface px-3 py-2 text-caption whitespace-pre-line text-ink shadow-float"
        >
          {full}
        </span>
      )}
    </>
  );
}

/** 말풍선의 최대 폭(px). 자리를 잡을 때 화면 밖으로 나가는지 재는 데도 쓴다. */
const MAX_WIDTH = 420;
