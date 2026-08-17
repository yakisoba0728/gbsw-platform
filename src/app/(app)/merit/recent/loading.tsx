import { SkeletonScreen, SkeletonTable, SkeletonTabs } from "@/components/ui/skeleton";

/** `/merit/recent`의 로딩 뼈대 — 탭과 표뿐이다. */
export default function Loading() {
  return (
    <SkeletonScreen>
      <SkeletonTabs />
      <SkeletonTable rows={10} />
    </SkeletonScreen>
  );
}
