import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "접근 권한 없음" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-[360px]">
        <p className="font-mono text-caption text-mut">403</p>
        <h1 className="mt-2 text-title font-semibold text-ink">
          권한이 없습니다
        </h1>
        <p className="mt-2 text-caption text-mut">
          이 화면은 계정의 권한 밖입니다. 필요하면 관리자에게 문의해 주세요.
        </p>

        <Link href="/" className={buttonClass({ className: "mt-8" })}>
          대시보드
        </Link>
      </div>
    </main>
  );
}
