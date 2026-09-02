import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClass, type ButtonSize } from "./button";

export function ChipLink({
  href,
  active,
  size = "md",
  className,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  size?: Extract<ButtonSize, "sm" | "md">;
  className?: string;
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={buttonClass({ variant: "chip", size, active, className })}
    >
      {children}
    </Link>
  );
}
