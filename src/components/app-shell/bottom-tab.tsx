"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/core/authz/roles";
import { cn } from "@/lib/cn";
import { bottomTabItems, isActive } from "./nav";

export function BottomTab({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const items = bottomTabItems(role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(20_36_31/0.08)] backdrop-blur-xl lg:hidden print:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-13 flex-1 flex-col items-center justify-center gap-1 rounded-[12px] px-1 transition-colors",
              active
                ? "bg-pri-soft font-medium text-pri-ink"
                : "text-mut hover:bg-soft hover:text-ink",
            )}
          >
            <Icon size={20} />
            <span className="text-xs">{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
