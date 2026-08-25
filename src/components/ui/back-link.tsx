import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/** 상세 화면 위의 "← 목록으로". 네 화면이 같은 문자열을 복붙하고 있었다. */
export function BackLink({
  href,
  reload = false,
  className,
  children,
}: {
  href: string;
  /**
   * 문서를 통째로 새로 연다. 흐름을 처음부터 되돌려야 하는 자리가 쓴다 —
   * 가입 화면의 「가입코드 다시 입력」은 클라이언트 이동으로는 앞 단계의
   * 상태가 남는다. 그 한 곳이 이걸 못 써서 같은 모양을 손으로 그리고 있었다.
   */
  reload?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Tag = reload ? "a" : Link;

  return (
    <Tag
      href={href}
      className={cn(
        "inline-flex min-h-9 items-center gap-1 text-caption font-medium text-mut lg:min-h-0",
        "transition-colors hover:text-ink",
        className,
      )}
    >
      <ChevronLeftIcon size={15} />
      {children}
    </Tag>
  );
}
