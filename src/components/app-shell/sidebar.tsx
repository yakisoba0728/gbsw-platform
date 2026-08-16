"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

/** 하위 메뉴가 없는 평범한 항목. */
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

/**
 * 하위 메뉴가 있는 항목.
 *
 * 접었다 펴는 상태를 따로 두지 않는다 — 그 그룹 안에 있으면 펴지고 아니면
 * 접힌다. 상태를 두면 새로고침·직접 링크 진입 때 접힌 채로 뜨는 경우가 생기고,
 * 그러면 "지금 어디에 있는지"가 화면에서 사라진다. 메뉴가 몇 개뿐이라
 * 자동 펼침으로 충분하다.
 */
function NavGroup({
  item,
  pathname,
  search,
  role,
}: {
  item: NavItem;
  pathname: string;
  search: URLSearchParams;
  role: Role | null;
}) {
  const children = visibleChildren(item, role);
  const expanded = isGroupActive(pathname, item);
  // 하나만 켠다 — /merit/stats는 /merit로도 시작해서 그냥 두면 그린마일리지까지
  // 함께 강조된다.
  const current = activeChild(pathname, search, children);
  const Icon = item.icon;

  return (
    <div>
      <Link
        href={item.href}
        /*
         * 현재 페이지는 한 화면에 하나다. 전에는 그룹 부모와 하위 항목에
         * 동시에 붙어서, 스크린리더로 메뉴를 훑으면 "현재 페이지"가 둘 나왔다.
         * 하위 항목이 하나라도 맞으면 현재 페이지는 그쪽이고, 부모 링크는
         * 그때 "지금 있는 곳"이 아니라 "그 묶음의 첫 화면으로 가는 길"이다.
         *
         * aria-expanded도 뺐다 — 이 링크는 눌러도 접히지 않고 페이지를 옮긴다.
         * 스크린리더가 "펼침 버튼"이라 안내한 뒤 눌러도 안 접히면, 사용자는
         * 자기가 뭘 잘못했다고 여기고 같은 자리를 반복해서 누르게 된다.
         * 펼침 여부는 지금 어느 그룹에 있느냐로 정해지지 조작할 수 있는
         * 상태가 아니다(위 주석 참고).
         */
        aria-current={current === null && isActive(pathname, item.href) ? "page" : undefined}
        className={cn(
          "flex items-center gap-[11px] rounded-btn px-3 py-2.5 text-sm transition-colors",
          expanded
            ? "font-bold text-pri"
            : "font-medium text-mut hover:bg-soft hover:text-ink",
        )}
      >
        <Icon size={19} />
        {item.label}
        <ChevronDown
          className={cn(
            "ml-auto transition-transform",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </Link>

      {expanded && (
        // 아이콘 자리(19px)와 간격(11px)만큼 들여써서 부모와 세로선을 맞춘다.
        <div className="mt-[3px] ml-[21px] flex flex-col gap-[2px] border-l border-line pl-3">
          {children.map((child) => {
            const active = child.href === current?.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-btn px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-pri-soft font-bold text-pri"
                    : "font-medium text-mut hover:bg-soft hover:text-ink",
                )}
              >
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
  const search = useSearchParams();
  const items = visibleItems(NAV_ITEMS, role);
  const adminItems = visibleItems(ADMIN_NAV_ITEMS, role);

  function render(item: NavItem) {
    // 하위 메뉴가 있어도 역할 때문에 하나도 안 보이면 평범한 링크로 그린다.
    return visibleChildren(item, role).length > 0 ? (
      <NavGroup
        key={item.href}
        item={item}
        pathname={pathname}
        search={search}
        role={role}
      />
    ) : (
      <NavLink key={item.href} item={item} pathname={pathname} />
    );
  }

  return (
    <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface px-4 py-5 lg:flex print:hidden">
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
        {items.map(render)}

        {adminItems.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-[7px] text-[11px] font-bold tracking-[0.06em] text-mut">
              관리자
            </p>
            {adminItems.map(render)}
          </>
        )}
      </nav>
    </aside>
  );
}
