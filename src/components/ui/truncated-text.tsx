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
 *
 * **마우스만으로는 안 된다.** 최근 부여의 항목·메모·사유는 각각 500자까지
 * 들어오는데 표에서는 한 줄로 잘린다 — 마우스를 못 쓰면 전문을 볼 방법이
 * 사라진다. 그래서 잘린 글에는 초점이 닿게 하고(`tabIndex`) 초점만으로도
 * 열리며, Esc로 닫힌다. 화면 낭독기는 아래 `sr-only` 전문으로 이미 듣는다.
 */
export function TruncatedText({
  full,
  className,
  outerClassName,
  focusable = true,
  children,
}: {
  /** 말풍선에 띄울 전문. 줄바꿈을 담을 수 있다. */
  full: string;
  /** 잘리는 글에 붙는다 — 글자 크기와 색. */
  className?: string;
  /**
   * 바깥 상자에 붙는다. **flex 자식으로 설 때 폭을 정하는 것은 바깥이다** —
   * `flex-1`·`shrink-0`·`w-[92px]`를 안쪽 글에 주면 상자가 내용만큼 벌어져
   * 잘릴 폭이 정해지지 않는다.
   */
  outerClassName?: string;
  /**
   * 초점을 받을지. **버튼·summary·option 안에 들어가는 자리는 끈다** — 그 자리는
   * 이미 제 초점을 가지고 있어서, 안에 초점이 하나 더 생기면 탭이 같은 것에 두 번
   * 멈춘다. 마우스 말풍선과 아래 낭독기 전문은 껐을 때도 그대로다.
   */
  focusable?: boolean;
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

  /** 잘린 글에만 초점을 준다 — 다 보이는 글에 Tab이 멈추면 이동만 길어진다. */
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth);
    measure();
    // 열 폭은 창 크기와 옆 칸 내용에 따라 바뀐다.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

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
      {/*
        초점은 바깥이 받는다. 잘린 글 자체는 aria-hidden인데(아래 sr-only와 두 번
        읽히지 않게), aria-hidden인 요소에 초점을 두면 낭독기에서 이름 없는 정거장이
        생긴다 — 초점과 숨김은 같은 요소에 함께 둘 수 없다.
      */}
      <span
        onMouseEnter={open}
        onMouseLeave={() => setAt(null)}
        onFocus={open}
        onBlur={() => setAt(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setAt(null);
        }}
        tabIndex={clipped && focusable ? 0 : undefined}
        className={cn(
          "block min-w-0",
          // 초점이 어디에 있는지 보여야 한다. 잘리지 않은 글에는 tabIndex가 없어
          // 이 테두리가 나올 일이 없다.
          "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          outerClassName,
        )}
      >
        <span
          ref={ref}
          // 읽어 주는 것은 아래 sr-only 전문이다 — 잘린 글까지 읽으면 두 번 읽는다.
          aria-hidden
          // nowrap이 빠지면 글이 접혀 버려 잘리지 않는다 — 줄이 늘어나고,
          // scrollWidth가 clientWidth를 넘지 않아 말풍선도 안 뜬다.
          className={cn(
            "block overflow-hidden text-ellipsis whitespace-nowrap",
            className,
          )}
        >
          {children}
        </span>
        <span className="sr-only">{full}</span>
      </span>

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
