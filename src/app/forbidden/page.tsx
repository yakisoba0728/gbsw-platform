import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "접근 권한 없음" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-8 text-center">
        <p className="text-[13px] font-bold text-rose">403</p>
        <h1 className="mt-1 text-xl font-extrabold text-ink">
          접근 권한이 없습니다
        </h1>
        <p className="mt-2 text-sm text-mut">
          이 화면을 볼 수 있는 권한이 계정에 없습니다. 필요하다면 관리자에게
          문의해 주세요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-btn bg-pri px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-pri-press"
        >
          대시보드로 돌아가기
        </Link>
      </div>
    </main>
  );
}
