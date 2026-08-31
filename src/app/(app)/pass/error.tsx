"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { PageScaffold } from "@/components/ui/page-scaffold";

/**
 * 출입증 화면이 던졌을 때의 안내. 이 파일이 없으면 앱 셸까지 사라진다.
 * reset()이 아니라 retry()를 쓴다 — reset은 다시 가져오지 않아 같은 화면으로 돌아온다.
 */
export default function PassError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // 클라이언트에서 난 오류는 여기 말고 남는 데가 없다.
    console.error(error);
  }, [error]);

  return (
    <PageScaffold
      eyebrow="오류"
      title="출입증을 불러오지 못했습니다"
      description="계속 같은 화면이 나오면 선생님께 알려 주세요."
      width="compact"
    >
      <div className={cardClass("panel")}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={retry}>
            다시 시도
          </Button>
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
