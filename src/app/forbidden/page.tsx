import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";

export const metadata: Metadata = { title: "접근 권한 없음" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(130%_90%_at_50%_0%,var(--color-pri-soft)_0%,var(--color-bg)_52%)] p-4 sm:p-8">
      <section
        aria-labelledby="forbidden-title"
        className={cardClass("page", "w-full max-w-md text-center shadow-float")}
      >
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-pri-ink">
          403
        </p>
        <h1 id="forbidden-title" className="mt-2 text-title font-semibold text-ink">
          권한이 없습니다
        </h1>
        <p className="mt-2 text-caption leading-6 text-mut">
          이 화면을 볼 수 있는 권한이 없습니다.
          <br />
          권한이 필요하다면 선생님께 문의해 주세요.
        </p>

        <Link
          href="/"
          className={buttonClass({
            variant: "secondary",
            size: "lg",
            full: true,
            className: "mt-8",
          })}
        >
          대시보드
        </Link>
      </section>
    </main>
  );
}
