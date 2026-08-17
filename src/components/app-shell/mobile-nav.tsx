"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";
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

/**
 * 좁은 화면 전용 메뉴 서랍. 하단 탭은 서너 칸이 한계라 관리자 메뉴 대부분이
 * 여기로만 갈 수 있다. `<dialog>`의 showModal()이 포커스 가두기·Esc 닫기·
 * 뒤쪽 비활성화를 해 준다.
 */
export function MobileNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // `<dialog open>` 속성으로 열면 모달이 아니라 포커스도 안 갇히고 backdrop도 없다.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // 이동하면 닫는다. 상벌점 하위 메뉴는 경로가 같고 `?track=`만 달라서 링크마다
  // onClick을 다는 대신 주소 변화를 본다. 렌더 도중 맞추면 깜빡임이 없다.
  const location = `${pathname}?${search}`;
  const [lastLocation, setLastLocation] = useState(location);
  if (lastLocation !== location) {
    setLastLocation(location);
    setOpen(false);
  }

  const items = visibleItems(NAV_ITEMS, role);
  const adminItems = visibleItems(ADMIN_NAV_ITEMS, role);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="-ml-2 rounded-btn p-2.5 text-mut transition-colors hover:bg-soft hover:text-ink lg:hidden"
      >
        <MenuIcon size={20} />
        <span className="sr-only">메뉴 열기</span>
      </button>

      <dialog
        id="mobile-nav"
        ref={dialogRef}
        aria-label="메뉴"
        onClose={() => setOpen(false)}
        // 클릭이 dialog 자기 자신에 떨어지면 그게 backdrop이다.
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-68 max-w-[82vw] border-0 bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex h-full w-full flex-col overflow-y-auto px-3 py-5">
          <div className="flex items-center justify-between gap-2 pb-6">
            <span className="flex items-center gap-2.5 px-3">
              <Image src="/brand/gbsw-logo.webp" alt="" width={30} height={30} />
              <span>
                <span className="block text-sm font-semibold tracking-tight text-ink">
                  GBSW
                </span>
                <span className="block text-xs text-mut">통합관리시스템</span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-btn p-2.5 text-mut transition-colors hover:bg-soft hover:text-ink"
            >
              <CloseIcon size={18} />
              <span className="sr-only">메뉴 닫기</span>
            </button>
          </div>

          <nav className="flex flex-col gap-0.5">
            {items.map((item) => (
              <DrawerItem
                key={item.href}
                item={item}
                pathname={pathname}
                search={search}
                role={role}
              />
            ))}

            {adminItems.length > 0 && (
              <>
                <p className="px-3 pt-6 pb-2 text-xs font-medium tracking-wider text-mut2 uppercase">
                  관리자
                </p>
                {adminItems.map((item) => (
                  <DrawerItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    search={search}
                    role={role}
                  />
                ))}
              </>
            )}
          </nav>
        </div>
      </dialog>
    </>
  );
}

const ITEM = "relative flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm transition-colors";
const IDLE = "font-normal text-mut hover:bg-soft hover:text-ink";

function Rail() {
  return (
    <span
      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-pri"
      aria-hidden
    />
  );
}

/**
 * 서랍의 메뉴 한 덩어리. 사이드바와 달리 하위 메뉴를 항상 펼친다 — 서랍은
 * "지금 갈 수 없는 곳으로 가려고" 여는 것이라 접혀 있으면 존재 이유가 없다.
 */
function DrawerItem({
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
  const current = activeChild(pathname, search, children);
  const active =
    children.length > 0
      ? isGroupActive(pathname, item)
      : isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <div>
      <Link
        href={item.href}
        // 사이드바와 같은 규칙 — 하위 항목이 맞으면 그쪽이 현재 페이지이고 부모는 아니다.
        aria-current={
          current === null && isActive(pathname, item.href) ? "page" : undefined
        }
        className={cn(
          ITEM,
          active
            ? children.length > 0
              ? "font-medium text-ink"
              : "bg-soft font-medium text-ink"
            : IDLE,
        )}
      >
        {active && children.length === 0 && <Rail />}
        <Icon size={18} />
        {item.label}
      </Link>

      {children.length > 0 && (
        <div className="mt-0.5 ml-6 flex flex-col gap-0.5 border-l border-line2 pl-3">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              aria-current={child.href === current?.href ? "page" : undefined}
              className={cn(
                "relative rounded-btn px-3 py-2.5 text-caption transition-colors",
                child.href === current?.href
                  ? "bg-soft font-medium text-ink"
                  : IDLE,
              )}
            >
              {child.href === current?.href && <Rail />}
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
