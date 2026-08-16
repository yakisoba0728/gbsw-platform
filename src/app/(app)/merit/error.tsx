"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 상벌점 화면이 던졌을 때의 안내.
 *
 * **없으면 앱 셸까지 사라진다.** Next의 기본 오류 화면은 레이아웃 밖에서
 * 그려지므로 사이드바도 상단바도 함께 없어지고, 사용자에게는 돌아갈 길이
 * 아무 데도 남지 않는다. 이 파일이 있으면 오류는 이 화면 자리에서만 나고
 * 메뉴는 그대로 서 있는다.
 *
 * `reset()`은 이 구간을 다시 그린다 — 원인이 일시적인 것(디비 연결이 잠깐
 * 끊긴 경우 등)이면 새로고침 없이 되살아난다. 그렇지 않은 경우를 위해
 * 대시보드로 나가는 길도 함께 둔다.
 *
 * 무엇이 틀렸는지는 적지 않는다. 여기 오는 오류는 서비스가 예상하고 던지는
 * 코드(그쪽은 각 화면이 사전으로 문구를 만든다)가 아니라 **예상 못 한 것**이라
 * message에 무엇이 들어 있을지 알 수 없다. digest는 서버 로그와 맞춰 볼
 * 열쇠라 적어 둔다.
 */
export default function MeritError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 컴포넌트에서 난 오류는 서버 로그에도 남지만, 클라이언트에서 난
    // 것은 여기 말고 남는 데가 없다.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[420px] rounded-card border border-line bg-surface p-8 text-center">
      <p className="text-[13px] font-bold text-rose">오류</p>
      <h2 className="mt-1 text-xl font-extrabold text-ink">
        상벌점을 불러오지 못했습니다
      </h2>
      <p className="mt-2 text-sm text-mut">
        잠시 후 다시 시도해 주세요. 계속 같은 화면이 나오면 관리자에게 알려
        주세요.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <Button type="button" onClick={reset}>
          다시 시도
        </Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-btn border border-line bg-surface px-[18px] py-[11px] text-sm font-bold text-ink transition-colors hover:bg-soft"
        >
          대시보드로
        </Link>
      </div>

      {error.digest && (
        <p className="mt-4 font-mono text-[11.5px] text-mut2">
          오류 번호 {error.digest}
        </p>
      )}
    </div>
  );
}
