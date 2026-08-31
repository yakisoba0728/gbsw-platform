import { BackLink } from "@/components/ui/back-link";
import { PageScaffold } from "@/components/ui/page-scaffold";
import {
  Skeleton,
  SkeletonScreen,
  SkeletonTable,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * 학생 상세의 로딩 뼈대. 바깥 폭은 화면 본문과 같아야 좌우가 안 튄다.
 *
 * **몸통은 갈래 중립이다.** 이 뼈대가 서 있는 동안 화면이 기다리는 것은 신원
 * 조회 하나뿐이고, 그다음부터는 갈래마다 제 Suspense 뼈대가 이어받는다 —
 * 여기서 상벌점 몸통을 그리면 출입증·학생 정보로 들어온 사람에게 한 번도
 * 나타나지 않을 모양이 먼저 스친다.
 */
export default function Loading() {
  return (
    <PageScaffold
      width="standard"
      eyebrow={<BackLink href="/merit">상벌점</BackLink>}
      title="학생"
      description={<Skeleton as="span" className="inline-block h-4 w-56 max-w-full" />}
      tabs={
        <SkeletonTabs
          count={3}
          size="sm"
          width="w-[72px]"
          className="flex-wrap"
        />
      }
    >
      <SkeletonScreen className="space-y-4">
        <SkeletonTable />
      </SkeletonScreen>
    </PageScaffold>
  );
}
