"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

const ITEM = "flex items-center gap-3 rounded-btn px-3 py-2 text-sm transition-colors";
const IDLE = "font-normal text-mut hover:bg-soft hover:text-ink";

/** 현재 항목 왼쪽의 에메랄드 막대. 화면 안에서 브랜드색이 나오는 유일한 자리다. */
function Rail() {
  return (
    <span
      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-pri"
      aria-hidden
    />
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative",
        ITEM,
        active ? "bg-soft font-medium text-ink" : IDLE,
      )}
    >
      {active && <Rail />}
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

/**
 * 하위 메뉴가 있는 항목.
 *
 * **머리글은 펴고 접기만 한다 — 눌러도 화면이 바뀌지 않는다.** 예전에는 링크라
 * 누르는 순간 첫 화면으로 넘어가면서 동시에 펴졌다: 목록을 보려고 눌렀는데
 * 이미 다른 곳에 가 있는 셈이라, 무엇이 있는지 훑고 고를 기회가 없었다.
 * 이동은 하위 항목만 한다.
 *
 * 접힘은 상태로 들되 그 묶음 안으로 들어오면 자동으로 편다 — 주소로 바로
 * 들어왔을 때 접힌 채 뜨면 「지금 어디인가」가 화면에서 사라진다. 나갈 때는
 * 건드리지 않는다: 손으로 편 것을 화면 이동이 도로 접으면 안 된다.
 */
function NavGroup({
  item,
  pathname,
  role,
}: {
  item: NavItem;
  pathname: string;
  role: Role | null;
}) {
  const children = visibleChildren(item, role);
  const inGroup = isGroupActive(pathname, item);
  // 하나만 켠다 — /merit/stats는 /merit로도 시작해서 그냥 두면 둘 다 강조된다.
  const current = activeChild(pathname, children);
  const Icon = item.icon;

  const [expanded, setExpanded] = useState(inGroup);
  // 렌더 중 비교로 맞춘다 — effect 안에서 setState하면 접힌 화면이 한 번 그려진다.
  const [lastInGroup, setLastInGroup] = useState(inGroup);
  if (lastInGroup !== inGroup) {
    setLastInGroup(inGroup);
    if (inGroup) setExpanded(true);
  }

  const listId = `nav-${item.href.replace(/\//g, "-")}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={listId}
        className={cn(
          ITEM,
          "w-full text-left",
          // 그 묶음 안에 있으면 머리글도 진하게 — 배경은 주지 않는다. 현재 화면은
          // 하위 항목이고, 머리글까지 칠하면 켜진 줄이 둘로 보인다.
          inGroup ? "font-medium text-ink" : IDLE,
        )}
      >
        <Icon size={18} />
        {item.label}
        <ChevronDown
          className={cn(
            "ml-auto text-mut2 transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {expanded && (
        // 아이콘 자리(18px)와 간격(12px)만큼 들여써서 부모와 세로선을 맞춘다.
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
                  "relative rounded-btn px-3 py-1.5 text-caption transition-colors",
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

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Sidebar({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const items = visibleItems(NAV_ITEMS, role);
  const adminItems = visibleItems(ADMIN_NAV_ITEMS, role);

  function render(item: NavItem) {
    // 하위 메뉴가 있어도 역할 때문에 하나도 안 보이면 평범한 링크로 그린다.
    return visibleChildren(item, role).length > 0 ? (
      <NavGroup
        key={item.href}
        item={item}
        pathname={pathname}
        role={role}
      />
    ) : (
      <NavLink key={item.href} item={item} pathname={pathname} />
    );
  }

  return (
    <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface px-3 py-5 lg:flex print:hidden">
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <Image src="/brand/gbsw-logo.webp" alt="" width={30} height={30} />
        <span>
          <span className="block text-sm font-semibold tracking-tight text-ink">
            GBSW
          </span>
          <span className="block text-xs text-mut">통합관리시스템</span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map(render)}

        {adminItems.length > 0 && (
          <>
            <p className="px-3 pt-6 pb-2 text-xs font-medium tracking-wider text-mut2 uppercase">
              교사
            </p>
            {adminItems.map(render)}
          </>
        )}
      </nav>
    </aside>
  );
}
