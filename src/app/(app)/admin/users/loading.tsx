import {
  SkeletonScreen,
  SkeletonTabs,
} from "@/components/ui/skeleton";

/**
 * `/admin/users`의 로딩 뼈대 — **탭 줄까지만 그린다.**
 *
 * 이 주소 하나가 세 탭(계정·초대·학생)을 낸다. 본문 모양이 탭마다 다른데
 * `loading.tsx`는 쿼리를 읽을 수 없어 어느 하나를 골라 그리면 나머지 둘에서
 * 틀린 뼈대가 된다 — 그러면 내용이 도착할 때 자리가 통째로 다시 짜인다.
 * 잘못된 모양을 그렸다가 지우는 것보다 늦게 자라나는 편이 덜 튄다.
 */
export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-7xl">
      <SkeletonTabs count={3} size="sm" width="w-14" />
    </SkeletonScreen>
  );
}
