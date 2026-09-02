import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

export function BackLink({
  href,
  reload = false,
  className,
  children,
}: {
  href: string;
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
