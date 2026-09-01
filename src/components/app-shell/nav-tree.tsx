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

/** 현재 항목 왼쪽의 에메랄드 막대. 화면 안에서 브랜드색이 나오는 유일한 자리다. */
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
/**
 * 서랍의 한 항목.
 *
 * **하위 메뉴는 펼친 채로 뜬다 — 사이드바와 갈리는 자리다.** 사이드바는 늘 켜져
 * 있어 접어 두면 다음에 다시 보이지만, 서랍은 "지금 갈 수 없는 곳으로 가려고"
 * 열었다 바로 닫는 자리라 접힌 채로 뜨면 무엇이 있는지 못 본다. 예전에는
 * 사이드바를 그대로 베껴 `useState(inGroup)`으로 시작했고, 그래서 폰에서 서랍을
 * 열면 「상벌점」·「출입증」이 접힌 채 화살표만 옆을 보고 있었다 — 누르면
 * 펴지는데도 "눌러도 안 열린다"로 읽혔다.
 *
 * 접는 것 자체는 남긴다. 교사 서랍은 열 줄이 넘어 스크롤이 생기므로, 안 보는
 * 묶음을 접어 아래를 끌어올릴 수 있어야 한다. 그래서 머리글은 여전히 버튼이고
 * **펴고 접기만 한다** — 누르는 순간 첫 화면으로 넘어가 버리면 목록을 훑고
 * 고를 기회가 없다.
 */
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
  // 하나만 켠다 — /merit/stats는 /merit로도 시작해서 그냥 두면 둘 다 강조된다.
  const current = activeChild(pathname, children);
  const Icon = item.icon;

  // 서랍은 펼친 채로 시작한다. 손으로 접은 것만 접혀 있다.
  const [expanded, setExpanded] = useState(expand === "always" || inGroup);

  // 렌더 중 비교로 맞춘다 — effect 안에서 setState하면 접힌 채로 한 번 그려진다.
  //
  // 서랍은 `inGroup`이 아니라 `pathname`을 본다. 화면을 옮겨도 **다시 마운트되지
  // 않으므로**, 손으로 접어 둔 상태가 그대로 굳는다. 실제로 로그 화면에서
  // 서랍을 열어 통계로 간 뒤 다시 열면, 통계 안에 있는데도 묶음이 접혀 있었다.
  // 경로가 바뀔 때마다 「지금 그 묶음 안인가」를 다시 묻는다.
  // 사이드바는 inGroup 변화만 보면 된다. effect를 쓰지 않는 이유는 둘이 같다.
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
          // 그 묶음 안에 있으면 머리글도 진하게 — 배경은 주지 않는다. 현재 화면은
          // 하위 항목이고, 머리글까지 칠하면 켜진 줄이 둘로 보인다.
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
    // 하위 메뉴가 있어도 역할 때문에 하나도 안 보이면 평범한 링크로 그린다.
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
