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
 * 이 모듈이 업무 화면의 유일한 `<h1>`을 소유한다. 상단바의 현재 위치 표시는
 * 문단으로 남겨, 스크린 리더의 제목 탐색 결과가 화면 구조와 일치하게 한다.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  headingLevel = 1,
  className,
}: {
  /** 제목 위의 짧은 업무 맥락. 역할·학년도처럼 페이지를 찾는 데 쓰는 값만 둔다. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** 한 줄. 화면이 무엇을 하는 곳인지 모호할 때만 적는다 — 제목이 답하면 비운다. */
  description?: ReactNode;
  /** 오른쪽 끝. 이 화면 전체에 걸리는 동작만 온다(내보내기·새로 만들기). */
  actions?: ReactNode;
  /** 제목 아래 한 줄 — 세그먼티드 컨트롤·필터 칩. */
  tabs?: ReactNode;
  headingLevel?: 1 | 2;
  className?: string;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className={cn("ui-page-header mb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-xs font-semibold tracking-[0.12em] text-pri-ink uppercase">
              {eyebrow}
            </p>
          )}
          <Heading className="text-title font-semibold text-ink [overflow-wrap:anywhere]">
            {title}
          </Heading>
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
