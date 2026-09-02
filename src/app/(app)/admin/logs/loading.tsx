import {
  SkeletonField,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/** `/admin/logs`의 뼈대. */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-6xl">
      <SkeletonTable
        rows={10}
        titleWidth="w-24"
        controls={
          <>
            {/* 동작 필터는 쌓인 동작 수만큼 생겨 두 줄까지 간다 —
                뼈대에서도 두 줄을 그려야 표가 위로 안 튄다. */}
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
