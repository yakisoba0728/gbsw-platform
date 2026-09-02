import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Segmented({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-btn border border-line bg-track p-0.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function segmentClass(active: boolean, className?: string): string {
  return cn(
    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-[5px] border px-3",
    "text-caption font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
    active
      ? "border-line bg-surface text-ink"
      : "border-transparent text-mut hover:text-ink",
    className,
  );
}

export function SegmentLink({
  href,
  active,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "className"> & {
  href: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={segmentClass(active, className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export function SegmentButton({
  active,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={segmentClass(active, className)}
      {...props}
    />
  );
}
