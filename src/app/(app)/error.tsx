"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "@/components/ui/button";

// Next 16.3의 retry는 서버 오류도 다시 가져온다.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[420px] py-10">
      <p className="text-caption text-mut">오류</p>
      <h2 className="mt-2 text-title font-semibold text-ink">
        화면을 열지 못했습니다
      </h2>
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
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          대시보드
        </Link>
      </div>
    </div>
  );
}
