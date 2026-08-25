"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
 * 좁은 화면 전용 메뉴 서랍. 하단 탭은 서너 칸이 한계라 교사 메뉴 대부분이
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
      <Button
        variant="quiet"
        size="icon"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="-ml-2 lg:hidden"
      >
        <MenuIcon size={20} />
        <span className="sr-only">메뉴 열기</span>
      </Button>

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
            <Button
              variant="quiet"
              size="icon"
              onClick={() => setOpen(false)}
            >
              <CloseIcon size={18} />
              <span className="sr-only">메뉴 닫기</span>
            </Button>
          </div>

          <nav className="flex flex-col gap-0.5">
            {items.map((item) => (
              <DrawerItem
                key={item.href}
                item={item}
                pathname={pathname}
                role={role}
              />
            ))}

            {adminItems.length > 0 && (
              <>
                <p className="px-3 pt-6 pb-2 text-xs font-medium tracking-wider text-mut2 uppercase">
                  교사
                </p>
                {adminItems.map((item) => (
                  <DrawerItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
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
/**
 * 서랍의 한 항목. 하위 메뉴가 있으면 머리글은 **펴고 접기만 한다** —
 * 사이드바와 같은 규칙이다. 누르는 순간 첫 화면으로 넘어가 버리면 목록을
 * 훑고 고를 기회가 없다.
 */
function DrawerItem({
  item,
  pathname,
  role,
}: {
  item: NavItem;
  pathname: string;
  role: Role | null;
}) {
  const children = visibleChildren(item, role);
  const current = activeChild(pathname, children);
  const inGroup = isGroupActive(pathname, item);
  const Icon = item.icon;

  const [expanded, setExpanded] = useState(inGroup);
  // 렌더 중 비교로 맞춘다 — effect 안에서 setState하면 접힌 채로 한 번 그려진다.
  //
  // `inGroup`이 아니라 `pathname`을 본다. 서랍은 화면을 옮겨도 **다시 마운트되지
  // 않으므로**, 첫 마운트 때 접힌 상태가 그대로 굳는다. 실제로 로그 화면에서
  // 서랍을 열어 통계로 간 뒤 다시 열면, 통계 안에 있는데도 묶음이 접혀 있었다.
  // 경로가 바뀔 때마다 「지금 그 묶음 안인가」를 다시 묻는다.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (inGroup) setExpanded(true);
  }

  const listId = `drawer-${item.href.replace(/\//g, "-")}`;

  if (children.length === 0) {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(ITEM, active ? "bg-soft font-medium text-ink" : IDLE)}
      >
        {active && <Rail />}
        <Icon size={18} />
        {item.label}
      </Link>
    );
  }

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
        <div
          id={listId}
          className="mt-0.5 ml-6 flex flex-col gap-0.5 border-l border-line2 pl-3"
        >
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
