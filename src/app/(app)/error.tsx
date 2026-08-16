"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 로그인 이후 화면 전체의 오류 경계.
 *
 * 전에는 앱에 `error.tsx`가 하나도 없어서, 서비스가 예상 못 한 오류를 던지면
 * Next 기본 500 화면이 뜨고 **앱 셸까지 사라졌다** — 사이드바도 상단바도 없으니
 * 사용자에게 남는 선택지가 뒤로가기뿐이었다. 이 파일은 `(app)/layout.tsx` 안쪽에
 * 그려지므로 셸이 그대로 남고, 여기서 다시 시도까지 할 수 있다.
 *
 * **`reset`이 아니라 `retry`를 쓴다.** `reset()`은 오류 상태만 지우고 다시
 * 가져오지 않는다 — 서버 컴포넌트가 렌더 중에 던진 경우(여기 오는 대부분)
 * 클라이언트가 오류가 박힌 payload를 그대로 들고 있어서, 같은 화면으로 즉시
 * 돌아와 눌러도 반응 없는 버튼이 된다. `retry()`가 서버에서 다시 받아온다.
 * Next 16.3에서 stable이 된 prop이다.
 *
 * 원인을 화면에 적지 않는다 — 오류 메시지에는 사용자에게 뜻이 없는 내부 사정이
 * 담기고, 그중 일부(제약 이름·경로)는 흘리지 않는 편이 낫다. 대신 서버 로그와
 * 짝지을 수 있는 `digest`만 보여준다.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[420px] py-6">
      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-[13px] font-bold text-rose">오류</p>
        <h2 className="mt-1 text-xl font-extrabold text-ink">
          화면을 불러오지 못했습니다
        </h2>
        <p className="mt-2 text-sm text-mut">
          잠시 후 다시 시도해 주세요. 같은 화면이 계속 나오면 관리자에게 알려
          주세요.
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
            href="/"
            className="text-[12.5px] font-semibold text-pri hover:underline"
          >
            대시보드로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
