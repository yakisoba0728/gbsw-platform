import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

/**
 * 제목 달린 카드. 페이지 바탕도 흰색이므로 이 테두리가 카드를 카드로 만든다.
 * `flush`는 표를 바로 넣는 호출부용이다 — 표가 이미 자기 셀 패딩을 갖고 있다.
 */
export function SectionCard({
  title,
  hint,
  aside,
  controls,
  headingLevel = 2,
  flush = false,
  variant = "section",
  tone = "default",
  className,
  children,
}: {
  title: ReactNode;
  /** 제목 아래 한 줄. 여러 문단이 필요하면 `controls`를 쓴다(<p> 중첩 금지). */
  hint?: ReactNode;
  /** 머리글 오른쪽 — 건수·"전체 보기" 링크·내보내기 버튼. */
  aside?: ReactNode;
  /** 제목 줄 아래 — 필터 칩·검색칸처럼 카드에 딸린 조작부. */
  controls?: ReactNode;
  /** 상단바 `<h1>`과 페이지 `<h2>` 아래에 놓이는 카드는 3을 쓴다. */
  headingLevel?: 2 | 3;
  /** 표를 바로 넣는 호출부. 본문 패딩을 없앤다. */
  flush?: boolean;
  /**
   * `section` — 머리글 띠(아래 구분선)가 있는 기본형.
   * `panel` — 테두리 한 겹짜리 폼 패널. 제목이 본문과 같은 여백 안에 앉는다.
   */
  variant?: "section" | "panel";
  /**
   * 되돌릴 수 없는 동작을 담는 카드. 테두리·제목이 벌점 계열로 선다.
   * `className`으로 덮을 수 없어 여기서 정한다 — `cn()`은 충돌을 해소하지 않는다.
   */
  tone?: "default" | "danger";
  className?: string;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const danger = tone === "danger";
  // 위험 카드는 테두리·제목이 벌점 계열로 선다. className으로는 덮을 수 없다 —
  // cn()은 tailwind-merge가 아니라 충돌을 해소하지 못한다.
  const edge = danger ? "border-rose-line" : undefined;
  const heading = cn("text-lg font-semibold", danger ? "text-rose" : "text-ink");

  if (variant === "panel") {
    return (
      <section className={cardClass("panel", cn(edge, className))}>
        {/* aside는 좁은 폭에서 접힌다 — 안 접으면 버튼 폭만큼 제목 칸이 눌린다. */}
        <div
          className={
            aside ? "flex flex-wrap items-start justify-between gap-3" : undefined
          }
        >
          <div className="min-w-0">
            <Heading className={heading}>{title}</Heading>
            {hint && <p className="mt-1 text-caption text-mut">{hint}</p>}
          </div>
          {aside}
        </div>
        {controls}
        {/* children이 없으면 빈 여백을 만들지 않는다. */}
        {children != null && children !== false && (
          <div className="mt-4">{children}</div>
        )}
      </section>
    );
  }

  return (
    <section className={cardClass("flush", cn(edge, className))}>
      <header className={cn("border-b px-5 py-4", danger ? "border-rose-line" : "border-line")}>
        <div
          className={
            aside ? "flex flex-wrap items-center justify-between gap-3" : undefined
          }
        >
          <div className="min-w-0">
            <Heading className={heading}>{title}</Heading>
            {hint && <p className="mt-1 text-caption text-mut">{hint}</p>}
          </div>
          {aside}
        </div>
        {controls}
      </header>

      {flush ? children : <div className="px-5 py-4">{children}</div>}
    </section>
  );
}
