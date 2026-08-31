import { PageScaffold } from "@/components/ui/page-scaffold";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton, SkeletonRows, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `/pass`는 역할로 갈리는데(학생은 QR, 교사는 결재 목록, 학부모는 동의 대기)
 * 이 자리는 역할을 모른다. **그래서 어느 한 화면을 흉내 내지 않는다** — 학생용
 * QR 자리를 그려 두면 교사가 들어올 때 뼈대와 결과가 어긋나 화면이 통째로 밀린다.
 * 셋에 공통인 페이지 머리와 첫 결과 목록까지만 세운다.
 */
export default function Loading() {
  return (
    <PageScaffold
      eyebrow="출입 관리"
      title="출입증"
      description={
        <Skeleton as="span" className="inline-block h-4 w-96 max-w-full" />
      }
      actions={<Skeleton className="h-9 w-24 rounded-btn" />}
      width="standard"
    >
      <SkeletonScreen className="space-y-5 lg:space-y-6">
        <SectionCard
          title={
            <>
              <span className="sr-only">출입증 목록</span>
              <Skeleton as="span" className="block h-6 w-28" />
            </>
          }
          flush
        >
          <SkeletonRows rows={6} />
        </SectionCard>
      </SkeletonScreen>
    </PageScaffold>
  );
}
