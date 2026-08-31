import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";

/** 라우트 트리에 아예 없는 주소도 영문 기본 화면 대신 이 경계를 쓴다. */
export default function RootNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className={cardClass("page", "w-full max-w-md")}>
        <p className="text-caption font-semibold tracking-wide text-pri-ink">
          GBSW 통합관리시스템
        </p>
        <p className="mt-8 font-mono text-caption text-mut">404</p>
        <h1 className="mt-2 text-title font-semibold text-ink">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-caption text-mut">
          주소가 잘못되었거나 페이지가 이동되었습니다. 주소를 확인하거나 처음 화면으로
          돌아가 주세요.
        </p>

        <Link
          href="/"
          className={buttonClass({ variant: "secondary", className: "mt-8" })}
        >
          처음 화면으로
        </Link>
      </section>
    </main>
  );
}
