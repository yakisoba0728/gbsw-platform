"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 로그인·가입 화면의 오류 경계. 이 그룹에는 layout.tsx가 없어 화면 전체를 직접 그린다.
 * `reset`이 아니라 `retry`다 — `reset()`은 서버 오류를 다시 가져오지 않는다.
 */
export default function AuthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-[360px]">
        <p className="text-caption text-mut">오류</p>
        <h1 className="mt-2 text-title font-semibold text-ink">
          화면을 열지 못했습니다
        </h1>
        <p className="mt-2 text-caption text-mut">
          다시 시도해도 같으면 학교 담당자에게 알려 주세요.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-mut2">
            오류 번호 {error.digest}
          </p>
        )}

        <div className="mt-8 flex items-center gap-4">
          <Button onClick={retry}>다시 시도</Button>
          <Link
            href="/login"
            className="text-caption text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
