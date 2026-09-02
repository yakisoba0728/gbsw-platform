"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import type { Role } from "@/core/authz/roles";
import { cn } from "@/lib/cn";
import {
  activeChild,
  ADMIN_NAV_ITEMS,
  isActive,
  isGroupActive,
  NAV_ITEMS,
  visibleChildren,
  visibleItems,
  type NavItem,
} from "./nav";

type NavDensity = "sidebar" | "drawer";
type NavExpand = "in-group" | "always";

const ROW =
  "flex items-center gap-3 rounded-btn px-3 text-sm transition-colors";
const IDLE = "font-normal text-mut hover:bg-soft hover:text-ink";

const DENSITY: Record<
  NavDensity,
  { row: string; child: string; listPrefix: string }
> = {
  sidebar: { row: "py-2", child: "py-1.5", listPrefix: "nav" },
  drawer: { row: "py-2.5", child: "py-2.5", listPrefix: "drawer" },
};

function Rail() {
  return (
    <span
      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-pri"
      aria-hidden
    />
  );
}

function NavItemLink({
  density,
  item,
  pathname,
}: {
  density: NavDensity;
  item: NavItem;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative",
        ROW,
        DENSITY[density].row,
        active ? "bg-soft font-medium text-ink" : IDLE,
      )}
    >
      {active && <Rail />}
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

function NavItemGroup({
  density,
  expand,
  item,
  pathname,
  role,
}: {
  density: NavDensity;
  expand: NavExpand;
  item: NavItem;
  pathname: string;
  role: Role | null;
}) {
  const children = visibleChildren(item, role);
  const inGroup = isGroupActive(pathname, item);
  const current = activeChild(pathname, children);
  const Icon = item.icon;

  const [expanded, setExpanded] = useState(expand === "always" || inGroup);

  const syncValue = expand === "always" ? pathname : inGroup;
  const [lastSyncValue, setLastSyncValue] = useState<string | boolean>(syncValue);
  if (lastSyncValue !== syncValue) {
    setLastSyncValue(syncValue);
    if (inGroup) setExpanded(true);
  }

  const listId = `${DENSITY[density].listPrefix}-${item.href.replace(/\//g, "-")}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={listId}
        className={cn(
          ROW,
          DENSITY[density].row,
          density === "drawer" && "relative",
          "w-full text-left",
          inGroup ? "font-medium text-ink" : IDLE,
        )}
      >
        <Icon size={18} />
        {item.label}
        <ChevronDownIcon
          size={14}
          className={cn(
            "ml-auto text-mut2 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div
          id={listId}
          className="mt-0.5 ml-6 flex flex-col gap-0.5 border-l border-line2 pl-3"
        >
          {children.map((child) => {
            const active = child.href === current?.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-btn px-3 text-caption transition-colors",
                  DENSITY[density].child,
                  active ? "bg-soft font-medium text-ink" : IDLE,
                )}
              >
                {active && <Rail />}
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NavTree({
  density,
  expand,
  role,
}: {
  density: NavDensity;
  expand: NavExpand;
  role: Role | null;
}) {
  const pathname = usePathname();
  const items = visibleItems(NAV_ITEMS, role);
  const adminItems = visibleItems(ADMIN_NAV_ITEMS, role);

  function renderItem(item: NavItem) {
    return visibleChildren(item, role).length > 0 ? (
      <NavItemGroup
        key={item.href}
        density={density}
        expand={expand}
        item={item}
        pathname={pathname}
        role={role}
      />
    ) : (
      <NavItemLink
        key={item.href}
        density={density}
        item={item}
        pathname={pathname}
      />
    );
  }

  return (
    <>
      {items.map(renderItem)}

      {adminItems.length > 0 && (
        <>
          <p className="px-3 pt-6 pb-2 text-xs font-medium tracking-wider text-mut2 uppercase">
            교사
          </p>
          {adminItems.map(renderItem)}
        </>
      )}
    </>
  );
}
