import { PageScaffold } from "@/components/ui/page-scaffold";
import { Skeleton, SkeletonTabs } from "@/components/ui/skeleton";

/**
 * `/merit/stats`의 로딩 뼈대 — **머리글까지만 그린다.**
 *
 * 이 주소 하나가 네 갈래(개요·순위·교사별·규정별)를 낸다. 본문 모양이 갈래마다
 * 다른데 `loading.tsx`는 쿼리를 읽을 수 없어 어느 하나를 골라 그리면 나머지 셋에서
 * 틀린 뼈대를 그리게 된다 — 그러면 집계가 도착할 때 자리가 통째로 다시 짜인다.
 *
 * 본문 뼈대는 페이지 안의 갈래별 Suspense 경계가 갖고 있다. 여기서는 갈래와
 * 무관하게 같은 머리글만 세우고 아래를 비워 둔다 — 잘못된 모양을 그렸다가
 * 지우는 것보다 늦게 자라나는 편이 덜 튄다.
 */
export default function Loading() {
  return (
    <PageScaffold
      width="data"
      title="상벌점 통계"
      description={<Skeleton as="span" className="inline-block h-4 w-64 max-w-full" />}
      tabs={
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonTabs size="sm" />
          <SkeletonTabs count={4} size="sm" className="flex-wrap" />
        </div>
      }
    >
      <span className="sr-only" aria-live="polite">
        불러오는 중
      </span>
    </PageScaffold>
  );
}
