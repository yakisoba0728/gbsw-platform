"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * 화면이 바뀔 때의 진입 애니메이션. template은 layout과 달리 라우팅마다 다시
 * 렌더되지만, 그것만으로는 부족하다 — React가 같은 자리의 같은 태그를 만나면 DOM
 * 노드를 재사용해서 CSS 애니메이션이 다시 걸리지 않는다(실측했다). 주소를 key로
 * 줘서 노드 자체를 새로 만든다.
 *
 * 쿼리까지 key에 넣는다. 검색·필터는 경로가 그대로라 빼면 정작 이 애니메이션이
 * 가장 필요한 자리에서 안 걸린다.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <div key={`${pathname}?${search}`} className="animate-page-in">
      {children}
    </div>
  );
}
