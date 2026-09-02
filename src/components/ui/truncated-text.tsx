"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TruncatedText({
  full,
  className,
  outerClassName,
  focusable = true,
  screenReaderText = "full",
  children,
}: {
  full: string;
  className?: string;
  outerClassName?: string;
  focusable?: boolean;
  screenReaderText?: "full" | "children";
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(
    null,
  );

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

  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  function open() {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MAX_WIDTH - 8));

    setAt(
      rect.bottom > window.innerHeight - 140
        ? { left, bottom: window.innerHeight - rect.top + 6 }
        : { left, top: rect.bottom + 6 },
    );
  }

  return (
    <>
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
          "focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          outerClassName,
        )}
      >
        <span
          ref={ref}
          aria-hidden={screenReaderText === "full" ? true : undefined}
          className={cn(
            "block overflow-hidden text-ellipsis whitespace-nowrap",
            className,
          )}
        >
          {children}
        </span>
        {screenReaderText === "full" && <span className="sr-only">{full}</span>}
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

const MAX_WIDTH = 420;
