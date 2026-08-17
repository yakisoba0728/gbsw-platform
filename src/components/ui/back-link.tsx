import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/** 상세 화면 위의 "← 목록으로". 네 화면이 같은 문자열을 복붙하고 있었다. */
export function BackLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-caption font-medium text-mut",
        "transition-colors hover:text-ink",
        className,
      )}
    >
      <ChevronLeftIcon size={15} />
      {children}
    </Link>
  );
}
