"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";

/**
 * 로그인 이후 화면의 오류 경계. `(app)/layout.tsx` 안쪽이라 앱 셸이 그대로 남는다.
 * `reset`이 아니라 `retry`다 — `reset()`은 서버 오류를 다시 가져오지 않는다.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageScaffold
      eyebrow="오류"
      title="화면을 열지 못했습니다"
      description="다시 시도해도 같으면 선생님께 알려 주세요."
      width="compact"
    >
      <div className={cardClass("panel")}>
        {/* 원인은 적지 않는다 — 사용자에게 뜻이 없고 내부 사정이 새어 나간다. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={retry}>
            다시 시도
          </Button>
          {/* 막다른 화면의 「대시보드」는 어디서나 같은 모양이다 — 403·404·오류
              네 화면이 초록 버튼·흰 버튼·맨 글자 링크로 제각각이었다. */}
          <Link href="/" className={buttonClass({ variant: "secondary" })}>
            대시보드
          </Link>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-mut2">
            오류 번호 <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </PageScaffold>
  );
}
