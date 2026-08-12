"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/core/authz/roles";
import { cn } from "@/lib/cn";
import {
  ADMIN_NAV_ITEMS,
  isActive,
  NAV_ITEMS,
  visibleItems,
  type NavItem,
} from "./nav";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-[11px] rounded-btn px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-pri-soft font-bold text-pri"
          : "font-medium text-mut hover:bg-soft hover:text-ink",
      )}
    >
      <Icon size={19} />
      {item.label}
    </Link>
  );
}

export function Sidebar({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const items = visibleItems(NAV_ITEMS, role);
  const adminItems = visibleItems(ADMIN_NAV_ITEMS, role);

  return (
    <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
      <div className="flex items-center gap-2.5 px-1.5 pb-5">
        <Image src="/brand/gbsw-logo.webp" alt="" width={36} height={36} />
        <span>
          <span className="block text-sm font-extrabold tracking-[-0.01em] text-ink">
            GBSW
          </span>
          <span className="block text-[11px] text-mut">통합관리시스템</span>
        </span>
      </div>

      <nav className="flex flex-col gap-[3px]">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        {adminItems.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-[7px] text-[11px] font-bold tracking-[0.06em] text-mut">
              관리자
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
