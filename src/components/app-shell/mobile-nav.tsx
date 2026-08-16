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
 * 좁은 화면 전용 메뉴 서랍.
 *
 * 바텀탭은 최상위 항목만 담는다(nav.ts 주석 참고). 그래서 lg 미만에서는
 * 관리자 메뉴(초대·학생·사용자·로그)와 상벌점 하위 메뉴(최근 부여·통계·항목
 * 관리)로 가는 길이 **아예 없었다** — 사이드바는 `lg:flex`고 상단바 버튼은
 * 로그아웃뿐이었다. 야간 점호 중인 사감이 휴대폰으로 "최근 부여"를 열 수 없다.
 *
 * 바텀탭에 항목을 더 넣지 않고 서랍을 따로 둔다 — 탭을 늘리면 글자가 읽을 수
 * 없게 작아지고, 데스크톱 사이드바도 건드리지 않아도 된다.
 *
 * `<dialog>`의 showModal()을 쓴다. 포커스 가두기·Esc 닫기·뒤쪽 요소 비활성화를
 * 브라우저가 해 주는데, 직접 만들면 조용히 빠뜨리기 쉬운 것들이다.
 */
export function MobileNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // 열고 닫는 일은 DOM 메서드로만 한다. `<dialog open>` 속성으로 열면 모달이
  // 아니라서 포커스도 안 갇히고 backdrop도 안 생긴다.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // 이동하면 닫는다. 링크마다 onClick을 다는 대신 주소 변화를 보는 이유:
  // 상벌점 하위 메뉴는 경로가 같고 `?track=`만 다르며(그린마일리지/기숙사),
  // 뒤로가기로 돌아왔을 때도 서랍이 열린 채 남으면 안 된다.
  //
  // effect가 아니라 렌더 도중에 맞춘다 — 열린 모습을 한 번 그렸다가 닫는
  // 깜빡임이 없고, effect 안 setState가 부르는 연쇄 렌더도 피한다
  // (React의 "값이 바뀔 때 state 조정" 패턴).
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
        className="-ml-2 rounded-btn p-2 text-mut transition-colors hover:bg-soft hover:text-ink lg:hidden"
      >
        <MenuIcon size={21} />
        <span className="sr-only">메뉴 열기</span>
      </button>

      <dialog
        id="mobile-nav"
        ref={dialogRef}
        aria-label="메뉴"
        onClose={() => setOpen(false)}
        // backdrop을 누르면 닫는다 — 클릭이 dialog 자기 자신에 떨어지면 그게
        // backdrop이다. 안쪽 내용은 아래 div가 전부 덮으므로 헷갈릴 일이 없다.
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-[272px] max-w-[82vw] border-0 bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-5">
          <div className="flex items-center justify-between gap-2 pb-5">
            <span className="flex items-center gap-2.5 px-1.5">
              <Image src="/brand/gbsw-logo.webp" alt="" width={32} height={32} />
              <span>
                <span className="block text-sm font-extrabold tracking-[-0.01em] text-ink">
                  GBSW
                </span>
                <span className="block text-[11px] text-mut">통합관리시스템</span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-btn p-2 text-mut transition-colors hover:bg-soft hover:text-ink"
            >
              <CloseIcon size={18} />
              <span className="sr-only">메뉴 닫기</span>
            </button>
          </div>

          <nav className="flex flex-col gap-[3px]">
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
                <p className="px-3 pt-4 pb-[7px] text-[11px] font-bold tracking-[0.06em] text-mut">
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

/**
 * 서랍의 메뉴 한 덩어리.
 *
 * 사이드바(NavGroup)와 달리 하위 메뉴를 **항상 펼친다.** 사이드바는 "지금 어디에
 * 있는지"를 보여주는 게 목적이라 현재 그룹만 펴지만, 서랍은 반대로 "지금 갈 수
 * 없는 곳으로 가려고" 여는 것이라 접혀 있으면 존재 이유가 없다.
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
    children.length > 0 ? isGroupActive(pathname, item) : isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <div>
      <Link
        href={item.href}
        /*
         * 사이드바(NavGroup)와 같은 규칙 — 현재 페이지는 한 화면에 하나다.
         * 하위 항목이 맞으면 그쪽이 현재 페이지이고 부모는 아니다.
         * 강조(active)는 그대로 그룹 전체를 본다: 그건 "지금 이 묶음 안에
         * 있다"는 표시라서 하위 항목의 현재 표시와 목적이 다르다.
         */
        aria-current={
          current === null && isActive(pathname, item.href) ? "page" : undefined
        }
        className={cn(
          "flex items-center gap-[11px] rounded-btn px-3 py-2.5 text-sm transition-colors",
          active
            ? children.length > 0
              ? "font-bold text-pri"
              : "bg-pri-soft font-bold text-pri"
            : "font-medium text-mut hover:bg-soft hover:text-ink",
        )}
      >
        <Icon size={19} />
        {item.label}
      </Link>

      {children.length > 0 && (
        // 아이콘 자리(19px)와 간격(11px)만큼 들여써서 부모와 세로선을 맞춘다.
        <div className="mt-[3px] ml-[21px] flex flex-col gap-[2px] border-l border-line pl-3">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              aria-current={child.href === current?.href ? "page" : undefined}
              className={cn(
                "rounded-btn px-3 py-2 text-[13px] transition-colors",
                child.href === current?.href
                  ? "bg-pri-soft font-bold text-pri"
                  : "font-medium text-mut hover:bg-soft hover:text-ink",
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
