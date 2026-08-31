import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 페이지 머리 — 제목·설명·동작.
 *
 * **카드가 아니다.** 예전에는 이 자리가 `cardClass("page")`였는데, 제목 두 줄을
 * 담자고 32px 여백의 흰 상자를 세우면 그 아래 진짜 내용이 담긴 카드와 무게가
 * 같아진다. 화면에 테두리 상자가 셋이면 어느 것이 페이지고 어느 것이 그 안의
 * 구획인지 테두리로는 알 수 없다. 머리글은 바탕 위에 그냥 앉고, 상자는 내용만
 * 갖는다.
 *
 * 상단바가 `<h1>`을 갖고 있으므로 여기는 `<h2>`다. 둘은 겹치지 않는다 —
 * 상단바는 「지금 어느 메뉴인가」(상벌점)를, 여기는 「무엇을 보고 있나」
 * (그린마일리지)를 답한다.
 */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  className,
}: {
  title: ReactNode;
  /** 한 줄. 화면이 무엇을 하는 곳인지 모호할 때만 적는다 — 제목이 답하면 비운다. */
  description?: ReactNode;
  /** 오른쪽 끝. 이 화면 전체에 걸리는 동작만 온다(내보내기·새로 만들기). */
  actions?: ReactNode;
  /** 제목 아래 한 줄 — 세그먼티드 컨트롤·필터 칩. */
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-title font-semibold text-ink">{title}</h2>
          {description && (
            <p className="mt-1 text-caption text-mut">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {tabs && <div className="mt-3.5">{tabs}</div>}
    </div>
  );
}
