import { cn } from "@/lib/cn";

/**
 * 카드 껍데기 클래스.
 *
 * 페이지 바탕도 흰색이라 이 테두리가 카드를 카드로 만든다 — 빼면 카드가 사라진다.
 * 제목이 맨 앞에 오는 평범한 카드는 `SectionCard`를 쓴다. 이 함수는 제목 앞에
 * 다른 것이 오거나(역할 라벨·상태 배지) 카드 자체가 링크인 자리를 위한 것이다.
 *
 * 안쪽 여백은 세 가지뿐이다:
 *   flush — 표나 머리글 띠를 직접 넣는다 (여백 없음)
 *   panel — 폼·안내 (p-5)
 *   page  — 페이지 대표 카드 (p-8)
 */
export type CardPad = "flush" | "panel" | "page";

const PADS: Record<CardPad, string> = {
  flush: "",
  panel: "p-5",
  page: "p-8",
};

export function cardClass(pad: CardPad = "panel", className?: string): string {
  return cn(
    "ui-card rounded-card border border-line bg-surface",
    PADS[pad],
    className,
  );
}
