import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { cardClass } from "./card";

/**
 * 비어 있는 자리.
 *
 * **문장 하나로 끝내지 않는다.** 「신청이 없습니다」만 적힌 상자는 지금 상태를
 * 알릴 뿐, 여기서 무엇을 할 수 있는지는 말하지 않는다 — 처음 온 사람이 화면을
 * 열면 아무것도 없는 흰 상자 앞에서 멈춘다. 할 일이 있는 자리에는 `action`으로
 * 그 버튼을 함께 세운다.
 *
 * `card` — 카드가 아직 없는 자리. 자기 테두리를 그린다.
 * `inside` — 이미 SectionCard 안. 테두리를 또 그리면 겹쳐 보인다.
 */
export function EmptyState({
  variant = "card",
  action,
  className,
  children,
}: {
  variant?: "card" | "inside";
  /** 이 자리에서 할 수 있는 일. 버튼이나 링크 하나. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        variant === "card" ? cardClass("flush", "px-5 py-12") : "px-5 py-12",
        className,
      )}
    >
      <span className="ui-empty-icon" aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5z" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      </span>
      <p className="text-caption text-mut">{children}</p>
      {action}
    </div>
  );
}
