import { SectionCard } from "@/components/ui/section-card";
import { SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-5xl space-y-4">
      <SectionCard title="출입증" flush>
        <SkeletonRows rows={3} />
      </SectionCard>
      <SectionCard title="내역" flush>
        <SkeletonRows rows={4} />
      </SectionCard>
    </SkeletonScreen>
  );
}
