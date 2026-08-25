"use client";

import { usePathname } from "next/navigation";

/**
 * 화면이 바뀔 때의 진입 애니메이션. template은 layout과 달리 라우팅마다 다시
 * 렌더되지만 그것만으로는 안 걸린다 — React가 같은 자리의 같은 태그를 만나면 DOM
 * 노드를 재사용해서 CSS 애니메이션이 다시 시작되지 않는다(실측했다). 경로를 key로
 * 줘서 노드 자체를 새로 만든다.
 *
 * **쿼리는 key에 넣지 않는다.** 검색·필터는 경로가 그대로인 이동이고, 거기서 이 덩어리를
 * 다시 마운트하면 방금 글자를 넣은 검색칸과 포커스가 함께 날아간다. 조건이 바뀐 것은
 * 결과 영역의 Suspense 경계가 뼈대로 알린다 — 화면 전체가 알릴 일이 아니다.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
