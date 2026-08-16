import { SkeletonScreen, SkeletonTable, SkeletonTabs } from "@/components/ui/skeleton";

/**
 * `/merit/recent`의 로딩 뼈대 — 탭과 표뿐이다.
 *
 * 전에는 여기에 통계 칸 세 개를 그렸다. 이 화면에는 통계 칸이 **아예 없어서**,
 * 내용이 도착하는 순간 세 칸이 사라지고 표가 위로 올라붙었다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs />
      <SkeletonTable rows={10} />
    </SkeletonScreen>
  );
}
