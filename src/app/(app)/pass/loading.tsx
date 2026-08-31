import { SectionCard } from "@/components/ui/section-card";
import { SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `/pass`는 역할로 갈리는데(학생은 QR, 교사는 결재 목록, 학부모는 동의 대기)
 * 이 자리는 역할을 모른다. **그래서 어느 한 화면을 흉내 내지 않는다** — 학생용
 * QR 자리를 그려 두면 교사가 들어올 때 뼈대와 결과가 어긋나 화면이 통째로 밀린다.
 * 셋에 공통인 것(카드 두 장에 줄 목록)까지만 세운다.
 */
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
