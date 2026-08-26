"use client";

import { Button } from "@/components/ui/button";

/** window.print()는 브라우저 API라 클라이언트 컴포넌트가 필요하다. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      인쇄
    </Button>
  );
}
