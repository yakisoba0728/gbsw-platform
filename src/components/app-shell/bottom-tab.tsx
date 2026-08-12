"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/core/authz/roles";
import { cn } from "@/lib/cn";
import { isActive, NAV_ITEMS, visibleItems } from "./nav";

export function BottomTab({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const items = visibleItems(NAV_ITEMS, role);

  return (
    <nav className="flex flex-none border-t border-line bg-surface px-1.5 pt-2 pb-3 lg:hidden">
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
              active ? "font-bold text-pri" : "font-medium text-mut",
            )}
          >
            <Icon size={21} />
            <span className="text-[10px]">{item.shortLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
