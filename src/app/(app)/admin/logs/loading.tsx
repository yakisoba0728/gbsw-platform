import {
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl">
      <SkeletonTable
        rows={10}
        titleWidth="w-24"
        controls={
          <>
            <SkeletonTabs
              count={14}
              size="sm"
              width="w-20"
              className="mt-3 flex-wrap"
            />
            <SkeletonField size="sm" className="mt-2.5" />
          </>
        }
      />
    </SkeletonScreen>
  );
}
