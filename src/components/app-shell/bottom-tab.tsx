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
    <nav className="flex flex-none border-t border-line bg-surface px-2 pt-2 pb-3 lg:hidden print:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1",
              active ? "font-medium text-ink" : "text-mut",
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
