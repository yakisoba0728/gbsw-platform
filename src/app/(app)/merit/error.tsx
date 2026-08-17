"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";

/**
 * 상벌점 화면이 던졌을 때의 안내. 이 파일이 없으면 앱 셸까지 사라진다.
 * reset()이 아니라 retry()를 쓴다 — reset은 다시 가져오지 않아 같은 화면으로 돌아온다.
 */
export default function MeritError({
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
    <div className={cardClass("page", "mx-auto max-w-[420px] text-center")}>
      <p className="text-caption font-medium text-rose">오류</p>
      <h2 className="mt-1 text-title font-semibold text-ink">
        상벌점을 불러오지 못했습니다
      </h2>
      <p className="mt-2 text-sm text-mut">
        계속 같은 화면이 나오면 관리자에게 알려 주세요.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <Button type="button" onClick={retry}>
          다시 시도
        </Button>
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          대시보드
        </Link>
      </div>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-mut2">오류 번호 {error.digest}</p>
      )}
    </div>
  );
}
