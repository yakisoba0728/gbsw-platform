"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "@/components/ui/button";

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
  useEffect(() => {
    // 클라이언트에서 난 오류는 여기 말고 남는 데가 없다.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[420px] py-10">
      <p className="text-caption text-mut">오류</p>
      <h2 className="mt-2 text-title font-semibold text-ink">
        화면을 열지 못했습니다
      </h2>
      {/* 원인은 적지 않는다 — 사용자에게 뜻이 없고 내부 사정이 새어 나간다. */}
      <p className="mt-2 text-caption text-mut">
        다시 시도해도 같으면 학교 담당자에게 알려 주세요.
      </p>

      {error.digest && (
        <p className="mt-4 text-xs text-mut2">
          오류 번호 <span className="font-mono">{error.digest}</span>
        </p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={retry}>다시 시도</Button>
        {/* 막다른 화면의 「대시보드」는 어디서나 같은 모양이다 — 403·404·오류
            네 화면이 초록 버튼·흰 버튼·맨 글자 링크로 제각각이었다. */}
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          대시보드
        </Link>
      </div>
    </div>
  );
}
