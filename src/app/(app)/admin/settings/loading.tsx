import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/admin/settings`의 뼈대. 트랙이 늘면 여기 반복 횟수도 함께 늘린다. */
export default function Loading() {
  return (
    <PageScaffold
      width="form"
      title="설정"
      description="학교 전체에 적용되는 운영 기준을 관리합니다."
    >
      <SkeletonScreen className="space-y-4">
        <div className={cardClass("flush")}>
          <div className="space-y-2 border-b border-line px-5 py-4">
            <Skeleton className="h-5 w-24 rounded-btn" />
            <Skeleton className="h-4 w-full max-w-md rounded-btn" />
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="border-b border-line2 px-5 py-4 last:border-0">
              <div className="flex flex-wrap items-end gap-2.5">
                {/* 라벨(≈25px) + 입력칸(md 36px). `Input`의 크기 눈금을 따라간다. */}
                <Skeleton className="h-[61px] w-26 rounded-field" />
                <Skeleton className="h-[61px] w-31 rounded-field" />
                <Skeleton className="h-[61px] w-31 rounded-field" />
                <Skeleton className="h-9 w-18 rounded-btn" />
              </div>
              <Skeleton className="mt-2 h-4 w-full max-w-lg rounded-btn" />
            </div>
          ))}
        </div>
      </SkeletonScreen>
    </PageScaffold>
  );
}
