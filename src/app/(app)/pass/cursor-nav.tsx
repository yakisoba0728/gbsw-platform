import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/* 커서 목록의 앞뒤 이동. 커서로는 쪽 번호로 건너뛸 수 없어 components/ui/pagination의
   숫자 목록을 쓸 수 없고, 걸음 버튼의 모양만 그대로 맞춘다. */
export function CursorNav({
  label,
  prev,
  next,
}: {
  label: string;
  prev: string | null;
  next: string | null;
}) {
  if (!prev && !next) return null;

  const step = buttonClass({ variant: "secondary", size: "sm" });

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-center gap-1.5 border-t border-line px-5 py-3"
    >
      {prev ? (
        <Link href={prev} className={step}>
          이전
        </Link>
      ) : (
        <span aria-disabled="true" className={`${step} opacity-40`}>
          이전
        </span>
      )}

      {next ? (
        <Link href={next} className={step}>
          다음
        </Link>
      ) : (
        <span aria-disabled="true" className={`${step} opacity-40`}>
          다음
        </span>
      )}
    </nav>
  );
}
