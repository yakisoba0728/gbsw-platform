import {
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-7xl">
      <SkeletonTabs count={3} size="sm" width="w-14" />
    </SkeletonScreen>
  );
}
