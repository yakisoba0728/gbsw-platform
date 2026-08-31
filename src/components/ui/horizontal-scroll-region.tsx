"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type HorizontalOverflowMetrics = Pick<HTMLElement, "clientWidth" | "scrollWidth">;

/** 실제로 가로로 움직일 거리가 있을 때만 키보드 스크롤 대상으로 만든다. */
export function horizontalScrollTabIndex({
  clientWidth,
  scrollWidth,
}: HorizontalOverflowMetrics): 0 | undefined {
  return scrollWidth > clientWidth ? 0 : undefined;
}

/**
 * 서버가 그린 표를 그대로 받는 작은 클라이언트 경계.
 *
 * `TableFrame` 전체를 Client Component로 만들면 서버 페이지가 넘기는 셀 함수가
 * 직렬화 경계를 건넌다. 여기서는 렌더된 children만 받고, 브라우저 폭 측정만 맡는다.
 */
export function HorizontalScrollRegion({
  ariaLabel,
  className,
  children,
}: {
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [tabIndex, setTabIndex] = useState<0 | undefined>(undefined);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    let frame: number | null = null;
    const measure = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const next = horizontalScrollTabIndex(region);
        setTabIndex((current) => (current === next ? current : next));
      });
    };

    // 첫 측정은 effect 안의 동기 setState를 피하면서 첫 paint 직후 수행한다.
    measure();

    // 놓인 자리뿐 아니라 표 자체도 본다. 필터·폰트 로딩으로 내용 폭만 바뀌는
    // 경우에는 바깥 상자의 clientWidth가 그대로이기 때문이다.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(region);
    if (region.firstElementChild) observer?.observe(region.firstElementChild);
    // ResizeObserver가 없는 환경에서도 창 크기 변경과 첫 측정은 동작한다.
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      className={cn(
        "ui-table-region scroll-x-hint overflow-x-auto rounded-b-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
