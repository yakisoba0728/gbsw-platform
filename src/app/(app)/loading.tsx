import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/**
 * `(app)` 세그먼트의 로딩 뼈대 — 실질적으로 **대시보드**(`(app)/page.tsx`)의 것이다.
 *
 * 대시보드는 집계 네 개를 병렬로 await 하는 화면이라 앱에서 체감 대기가 가장 긴데,
 * 뼈대가 없어 그동안 이전 화면이 그대로 멈춰 있었다 — 사용자에게는 클릭이 안 먹은
 * 것과 구별되지 않는다.
 *
 * ## 여기 두는 대가 (일부러 감수한다)
 *
 * `loading.tsx`는 같은 폴더의 `page.tsx`와 **그 아래 자식들**을 Suspense로 감싼다.
 * 그러니 이 뼈대는 대시보드 말고도, 사이에 자기 `loading.tsx`가 없는 하위 화면에
 * 함께 걸린다. 실제로 걸리는 건 **`/parent-invite` 하나뿐이다** — 나머지 하위
 * 화면들은 더 가까운 조상이 이미 자기 뼈대를 갖고 있어서 그쪽이 이긴다:
 *
 * - `/admin/students/import` → `admin/students/loading.tsx`
 * - `/admin/users/[userId]` → `admin/users/loading.tsx`
 * - `/merit/students/[id]/print` → `merit/students/[studentId]/loading.tsx`
 *
 * 그래서 **대시보드 모양을 그대로 베끼지 않고 중립적으로 둔다**: 머리 띠 하나 +
 * 2열 카드 + 목록 카드. 대시보드(인사 카드 → 트랙 요약 2장 → 바로가기 2장 →
 * 최근 부여)와 `/parent-invite`(2열: 발급 폼 + 내가 만든 코드) 어느 쪽에도 크게
 * 어긋나지 않는 최소 공통 짜임이다.
 *
 * 대안은 `(app)/page.tsx`를 자기 폴더로 내리거나 `/parent-invite`에 전용 뼈대를
 * 두는 것이다. 둘 다 파일이 늘고, 지금 어긋남의 크기(2열 카드 한 벌)가 그 값을
 * 치를 만큼 크지 않다고 봤다. `/parent-invite`가 느려지거나 짜임이 크게 달라지면
 * 그때 전용 뼈대를 두는 편이 낫다.
 */
export default function Loading() {
  return (
    <SkeletonScreen>
      {/* 인사 카드 / 화면 머리 띠 자리 */}
      <Skeleton className="h-[104px]" />

      {/* 2열 카드 — 대시보드의 트랙 요약, /parent-invite의 발급 폼+목록 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-[176px]" />
        <Skeleton className="h-[176px]" />
      </div>

      {/* 목록 카드 자리 (최근 부여 · 내가 만든 코드) */}
      <Skeleton className="h-[220px]" />
    </SkeletonScreen>
  );
}
