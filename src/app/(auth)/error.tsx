"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 로그인·가입 화면의 오류 경계.
 *
 * `(app)/error.tsx`와 달리 감쌀 셸이 없다 — 이 그룹에는 layout.tsx가 없고
 * 각 페이지가 스스로 AuthPanel로 화면을 채운다. 그래서 여기서 화면 전체
 * (min-h-dvh 가운데 정렬)를 직접 그린다. `forbidden/page.tsx`와 같은 규격이다.
 *
 * 사진 패널까지 다시 그리지는 않는다 — 오류 화면의 목적은 "다시 시도"와
 * "로그인으로"까지 데려다주는 것뿐이라 브랜드 패널은 방해만 된다.
 *
 * **`reset`이 아니라 `retry`를 쓴다.** `reset()`은 오류 상태만 지우고 다시
 * 가져오지 않아서, 서버에서 난 오류에는 눌러도 반응 없는 버튼이 된다.
 * Next 16.3에서 stable이 된 prop이다.
 */
export default function AuthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-[13px] font-bold text-rose">오류</p>
        <h1 className="mt-1 text-xl font-extrabold text-ink">
          화면을 불러오지 못했습니다
        </h1>
        <p className="mt-2 text-sm text-mut">
          잠시 후 다시 시도해 주세요. 같은 화면이 계속 나오면 학교 담당자에게
          알려 주세요.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-[11.5px] text-mut2">
            오류 번호 {error.digest}
          </p>
        )}

        <Button onClick={retry} className="mt-6">
          다시 시도
        </Button>

        <p className="mt-4">
          <Link
            href="/login"
            className="text-[12.5px] font-semibold text-pri hover:underline"
          >
            로그인으로
          </Link>
        </p>
      </div>
    </main>
  );
}
