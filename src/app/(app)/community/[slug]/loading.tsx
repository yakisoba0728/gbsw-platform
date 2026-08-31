import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/community/[slug]`의 뼈대 — 게시판 머리글 + 글 목록. */
export default function Loading() {
  return (
    <PageScaffold
      eyebrow="커뮤니티 게시판"
      title={
        <>
          <span className="sr-only">게시판</span>
          <Skeleton as="span" className="block h-7 w-48 max-w-full" />
        </>
      }
      description={
        <Skeleton as="span" className="inline-block h-4 w-72 max-w-full" />
      }
      actions={<Skeleton className="h-9 w-24 rounded-btn" />}
      width="data"
    >
      <SkeletonScreen className="space-y-5 lg:space-y-6">
        <div className={cardClass("flush")}>
          <div className="@container">
            {/* 실제 DataTable처럼 좁은 폭은 카드 행, 넓은 폭은 표 행으로 선다. */}
            <div className="@4xl:hidden">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="border-b border-line2 px-5 py-3 last:border-0">
                  <Skeleton className="h-5" />
                  <Skeleton className="mt-2 h-3 w-40 max-w-full" />
                </div>
              ))}
            </div>

            <div className="hidden @4xl:block">
              <div className="grid grid-cols-[minmax(0,1fr)_10rem_8rem] gap-6 border-b border-line bg-soft px-5 py-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
              </div>
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_10rem_8rem] gap-6 border-b border-line2 px-5 py-3 last:border-0"
                >
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SkeletonScreen>
    </PageScaffold>
  );
}
