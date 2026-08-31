import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { SectionCard } from "@/components/ui/section-card";
import {
  Skeleton,
  SkeletonField,
  SkeletonRows,
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/pass/history`의 로딩 뼈대 — 조건 패널 + 목록 표.
 *
 * **page.tsx의 골격과 같은 값이어야 한다.** 어긋나면 화면이 들어오는 순간
 * 뼈대가 튀고, 그 튐은 느려서가 아니라 뼈대가 틀려서 생긴 것이라 원인을
 * 짚기 어렵다.
 */
export default function Loading() {
  return (
    <PageScaffold
      eyebrow={<BackLink href="/pass">출입증 운영으로 돌아가기</BackLink>}
      title="출입증 전체 내역"
      description="학생, 유형, 상태와 기간으로 지난 출입 기록을 찾아봅니다."
      width="data"
    >
      <SkeletonScreen className="space-y-5 lg:space-y-6">
        <SectionCard variant="panel" title="조회 조건">
          <div className="@container space-y-2.5">
            {/* 유형 세 칩 · 상태 여섯 칩. 높이는 ChipLink의 sm 규격을 따른다. */}
            <SkeletonTabs count={3} size="sm" className="flex-wrap" />
            <SkeletonTabs count={6} size="sm" className="flex-wrap" />

            {/* 기간 — 날짜 칸 둘과 「적용」. 칸 폭은 page.tsx의 w-40과 같다. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <SkeletonField size="sm" className="w-40" />
              <SkeletonField size="sm" className="w-40" />
              <Skeleton className="h-9 w-14 rounded-btn lg:h-8" />
            </div>

            <div className="grid gap-2.5 @2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:items-center">
              <div className="flex max-w-xl gap-2">
                <SkeletonField size="md" className="min-w-0 flex-1" />
                <Skeleton className="h-9 w-16 shrink-0 rounded-btn" />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Skeleton className="h-4 w-10" />
                {/* 내보내기 버튼은 md라 높이가 고정이다 — 칩과 달리 좁은 폭에서 안 커진다. */}
                <Skeleton className="h-9 w-24 rounded-btn" />
              </div>
            </div>
          </div>
        </SectionCard>

        <div className={cardClass("flush", "@container")}>
          {/* DataTable이 표로 보이는 폭에서만 머리글 띠를 남긴다. */}
          <div className="hidden border-b border-line bg-soft px-5 py-2 @4xl:block">
            <Skeleton className="h-4 w-24" />
          </div>
          <SkeletonRows rows={10} />
        </div>
      </SkeletonScreen>
    </PageScaffold>
  );
}
