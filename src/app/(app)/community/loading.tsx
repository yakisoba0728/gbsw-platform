import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/community`의 뼈대 — 게시판 카드 격자. */
export default function Loading() {
  return (
    <PageScaffold
      eyebrow="학교 소통"
      title="커뮤니티"
      description="공지와 학교생활 이야기를 게시판별로 확인하세요."
      width="data"
    >
      <SkeletonScreen className="@container">
        <div className="grid gap-4 @3xl:grid-cols-2 lg:gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cardClass("panel", "min-h-44")}>
              <Skeleton className="h-6 w-28 rounded-btn" />
              <Skeleton className="mt-2 h-4 w-48 max-w-full rounded-btn" />
              <Skeleton className="mt-8 h-3 w-24 rounded-btn" />
            </div>
          ))}
        </div>
      </SkeletonScreen>
    </PageScaffold>
  );
}
