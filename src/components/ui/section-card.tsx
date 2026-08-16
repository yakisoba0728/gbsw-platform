import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 제목 달린 카드 섹션. 18곳이 같은 뼈대를 복붙하고 있었다.
 *
 * `charts.tsx`의 `ChartCard`가 이미 정확히 이것이었는데 merit 폴더에 갇혀 있어서
 * 나머지 화면들이 각자 다시 적었다. merit 전용인 구석이 없으므로 ui로 올린다.
 *
 * 본문 패딩은 **표를 바로 넣는 호출부가 많아** 끌 수 있게 했다(`flush`).
 * 표는 자기 셀 패딩(px-5/px-3)을 이미 갖고 있어서, 바깥에서 한 겹 더 주면
 * 첫 열이 카드 안쪽으로 두 번 밀려 머리글과 어긋난다.
 */
export function SectionCard({
  title,
  hint,
  aside,
  controls,
  headingLevel = 2,
  flush = false,
  className,
  children,
}: {
  title: ReactNode;
  /** 제목 아래 한 줄 설명. 여러 문단이 필요하면 `controls`를 쓴다(<p> 중첩 금지). */
  hint?: ReactNode;
  /** 머리글 오른쪽 — 건수·"전체 보기 →" 링크·내보내기 버튼이 여기 온다. */
  aside?: ReactNode;
  /** 머리글 안, 제목 줄 아래 — 필터 칩·검색칸처럼 카드에 딸린 조작부. */
  controls?: ReactNode;
  /**
   * 화면에 이미 `<h1>`(상단바)과 `<h2>`가 있는 자리(대시보드 카드)는 3을 쓴다.
   * 제목 글자 크기는 단계와 무관하게 같다 — 시안이 그렇다.
   */
  headingLevel?: 2 | 3;
  /** 표를 바로 넣는 호출부. 본문 패딩을 없앤다. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={cn("rounded-card border border-line bg-surface", className)}>
      <header className="border-b border-line px-5 py-4">
        <div className={aside ? "flex items-center justify-between gap-3" : undefined}>
          <div className="min-w-0">
            <Heading className="text-base font-extrabold text-ink">{title}</Heading>
            {hint && <p className="mt-1 text-[12px] text-mut">{hint}</p>}
          </div>
          {aside}
        </div>
        {controls}
      </header>

      {flush ? children : <div className="px-5 py-4">{children}</div>}
    </section>
  );
}
