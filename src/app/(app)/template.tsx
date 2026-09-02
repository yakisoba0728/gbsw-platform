"use client";

import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 검색어 변경 때 입력과 포커스를 유지하도록 쿼리는 재마운트 키에서 제외한다.

  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
