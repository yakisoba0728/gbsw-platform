import { cardClass } from "@/components/ui/card";
import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** `/admin/community`의 뼈대 — 게시판 추가 폼 · 목록 표. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      {/* 게시판 추가 — 이름/주소 · 설명 · 권한 상자 · 체크칸 둘 · 버튼 */}
      <div className={cardClass("panel")}>
        <Skeleton className="mb-4 h-5 w-24 rounded-btn" />
        <div className="space-y-2.5">
          <Skeleton className="h-[61px] rounded-field" />
          <Skeleton className="h-[61px] rounded-field" />
          <Skeleton className="h-[132px] rounded-card" />
          <Skeleton className="h-9 w-32 rounded-btn" />
        </div>
      </div>

      {/* 게시판 목록 — 머리글 띠 + 표 */}
      <div className={cardClass("flush")}>
        <div className="border-b border-line px-5 py-4">
          <Skeleton className="h-5 w-24 rounded-btn" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-btn" />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
